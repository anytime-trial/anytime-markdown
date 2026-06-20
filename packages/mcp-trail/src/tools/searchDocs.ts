/**
 * search_docs — doc-core.db（ドキュメント検索 DB）への問い合わせ。
 * 構造（バックリンク・近傍）＋キーワード（FTS5）＋意味（cosine・ollama）を 1 ツールで提供する。
 */

import { z } from 'zod';
import {
  openDocDb,
  getDocCoreDbPath,
  searchFts,
  searchSemantic,
  backlinks,
  neighbors,
  isRelationType,
  type EmbedFn,
  type RelationType,
} from '@anytime-markdown/doc-core';
import { createOllamaClient } from '@anytime-markdown/agent-core';

export const SearchDocsInputSchema = z.object({
  query: z.string().optional().describe('Free-text query (keyword / semantic modes)'),
  mode: z
    .enum(['keyword', 'semantic', 'backlinks', 'neighbors'])
    .optional()
    .describe('keyword (FTS5, default) / semantic (cosine, needs ollama) / backlinks / neighbors'),
  path: z.string().optional().describe('Target doc path for backlinks/neighbors (root-relative, e.g. spec/...)'),
  type: z
    .string()
    .optional()
    .describe('Relation type filter: references/depends-on/implements/part-of/supersedes/refines'),
  hops: z.number().optional().describe('Neighbor BFS hops (default 1)'),
  limit: z.number().optional().describe('Max results (default 20)'),
});

export type SearchDocsInput = z.infer<typeof SearchDocsInputSchema>;

export async function handleSearchDocs(input: SearchDocsInput): Promise<unknown> {
  const db = openDocDb(getDocCoreDbPath());
  try {
    const mode = input.mode ?? 'keyword';
    const limit = input.limit ?? 20;
    const relType: RelationType | undefined = input.type && isRelationType(input.type) ? input.type : undefined;

    if (mode === 'backlinks') {
      if (!input.path) return { error: 'path is required for backlinks' };
      return { mode, path: input.path, results: backlinks(db, input.path, relType) };
    }
    if (mode === 'neighbors') {
      if (!input.path) return { error: 'path is required for neighbors' };
      const results = neighbors(db, input.path, {
        hops: input.hops,
        types: relType ? [relType] : undefined,
      });
      return { mode, path: input.path, results };
    }
    if (mode === 'semantic') {
      if (!input.query) return { error: 'query is required for semantic' };
      const baseUrl = process.env['OLLAMA_BASE_URL'];
      const ollama = createOllamaClient(baseUrl ? { baseUrl } : {});
      const model = process.env['DOC_CORE_EMBED_MODEL'] || 'bge-m3';
      const embed: EmbedFn = async (text) =>
        Array.from((await ollama.embeddings({ model, prompt: text })).embedding);
      return { mode, query: input.query, results: await searchSemantic(db, embed, input.query, limit) };
    }
    // keyword (FTS5)
    if (!input.query) return { error: 'query is required for keyword' };
    return { mode: 'keyword', query: input.query, results: searchFts(db, input.query, limit) };
  } finally {
    db.close();
  }
}
