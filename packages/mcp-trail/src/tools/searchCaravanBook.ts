import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import {
  hybridSearchCaravanBook,
  openCaravanBookDb,
  shapeSearchResponse,
  fetchEntityAliases,
} from '@anytime-markdown/trail-caravan-book/query';
import type { ShapedSearchResult } from '@anytime-markdown/trail-caravan-book/query';
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
  detail: z
    .enum(['compact', 'normal', 'full'])
    .optional()
    .describe(
      'Response tiering (default compact): compact = one-line entities + aggregated edges + trimmed episodes; normal = untrimmed; full = normal + aliases and more episodes. Drill down by id afterwards',
    ),
});

export type SearchCaravanBookInput = z.infer<typeof SearchCaravanBookInputSchema>;

export async function handleSearchCaravanBook(input: SearchCaravanBookInput): Promise<ShapedSearchResult> {
  const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'];

  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));

  try {
    const ollama = createOllamaClient(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {});
    const limit = input.limit ?? 20;
    // 既定 compact（spec §7.5）。消費者は AI エージェントのみで固定パーサは無い
    // ため、応答形状の互換より予算内の有効情報密度を優先する。
    const detail = input.detail ?? 'compact';
    // ハイブリッド経路（BM25 が識別子一致・vector が意味検索を担い RRF で融合。
    // ollama 不通時は BM25 のみへ縮退する）。素の searchCaravanBook は
    // vector 単独のため識別子クエリを取りこぼす。
    const result = await hybridSearchCaravanBook({
      db: memHandle.db,
      ollama,
      input: {
        ...input,
        final_limit: limit,
        bm25_limit: Math.max(30, limit),
        vec_limit: Math.max(30, limit),
        episodes_per_entity: detail === 'full' ? 5 : 3,
      },
    });
    const aliases =
      detail === 'full' ? fetchEntityAliases(memHandle.db, result.entities.map((e) => e.id)) : undefined;
    return shapeSearchResponse(result, detail, aliases);
  } finally {
    memHandle.close();
  }
}
