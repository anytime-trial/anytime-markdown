import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import {
  hybridSearchCaravanBook,
  openCaravanBookDb,
} from '@anytime-markdown/trail-caravan-book/query';
import type { SearchResult } from '@anytime-markdown/trail-caravan-book/query';
import { createOllamaClient } from '@anytime-markdown/agent-core';
import { resolveCaravanDbPath } from '../dbPath';

export const SearchCaravanBookInputSchema = z.object({
  workspacePath: workspacePathParam,
  query: z.string().describe('Search query'),
  entity_types: z.array(z.string()).optional().describe('Filter by entity types'),
  source_type: z.string().optional().describe('Filter by source type'),
  since: z.string().optional().describe('ISO 8601 date filter'),
  limit: z.number().optional().describe('Max results (default 20)'),
  hops: z.number().optional().describe('Graph traversal hops (0 or 1)'),
});

export type SearchCaravanBookInput = z.infer<typeof SearchCaravanBookInputSchema>;

export async function handleSearchCaravanBook(input: SearchCaravanBookInput): Promise<SearchResult> {
  const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'];

  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));

  try {
    const ollama = createOllamaClient(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {});
    const limit = input.limit ?? 20;
    // ハイブリッド経路（BM25 が識別子一致・vector が意味検索を担い RRF で融合。
    // ollama 不通時は BM25 のみへ縮退する）。素の searchCaravanBook は
    // vector 単独のため識別子クエリを取りこぼす。
    return await hybridSearchCaravanBook({
      db: memHandle.db,
      ollama,
      input: {
        ...input,
        final_limit: limit,
        bm25_limit: Math.max(30, limit),
        vec_limit: Math.max(30, limit),
      },
    });
  } finally {
    memHandle.close();
  }
}
