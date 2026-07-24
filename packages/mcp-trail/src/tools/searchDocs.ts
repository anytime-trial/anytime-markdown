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
  searchSemanticSections,
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
  granularity: z
    .enum(['doc', 'section'])
    .optional()
    .describe(
      'semantic mode only: doc (default, whole-doc embeddings truncated to ~3000 chars) / section (leaf-section embeddings, returns heading for pinpoint reference)',
    ),
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
      const granularity = input.granularity ?? 'doc';
      // クエリは格納済み embedding と同一モデルで埋め込む（モデル/次元の食い違いによる無言の誤結果を防ぐ）。
      const modelTable = granularity === 'section' ? 'doc_section_embedding' : 'doc_embedding';
      const storedModel = (db.prepare(`SELECT model FROM ${modelTable} LIMIT 1`).get() as
        | { model: string }
        | undefined)?.model;
      if (!storedModel) {
        return {
          mode,
          granularity,
          query: input.query,
          results: [],
          note: `no ${granularity} embeddings present (run daemon embedding backfill with ollama up)`,
        };
      }
      const baseUrl = process.env['OLLAMA_BASE_URL'];
      const ollama = createOllamaClient(baseUrl ? { baseUrl } : {});
      const embed: EmbedFn = async (text) =>
        Array.from((await ollama.embeddings({ model: storedModel, prompt: text })).embedding);
      if (granularity === 'section') {
        return {
          mode,
          granularity,
          query: input.query,
          model: storedModel,
          // storedModel で絞り込み、モデル変更 backfill 途中の新旧混在行を除外する。
          results: await searchSemanticSections(db, embed, input.query, limit, storedModel),
        };
      }
      return {
        mode,
        granularity,
        query: input.query,
        model: storedModel,
        results: await searchSemantic(db, embed, input.query, limit),
        // FR-6: doc 粒度の死角の明示（全文検索が要るなら granularity: 'section'）。
        note: 'doc embeddings cover only the first ~3000 chars (+ heading outline) of each doc; use granularity: "section" for full-body coverage',
      };
    }
    // keyword (FTS5)
    if (!input.query) return { error: 'query is required for keyword' };
    return { mode: 'keyword', query: input.query, results: searchFts(db, input.query, limit) };
  } finally {
    db.close();
  }
}
