import { randomUUID } from 'node:crypto';
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

/** hit_entity_ids へ保存するヒット実体 ID の上限（screen spec §2.5）。 */
export const AGENT_SEARCH_HIT_CAP = 20;

/**
 * エージェント照会を caravan_search_events へ記録する（screen spec §2.5）。
 *
 * 知識グラフ画面の「エージェント照会」リストがここで残した hit_entity_ids を読んで
 * 該当実体を開く。記録の失敗で検索応答を止めない（fail-open。警告は MCP stdio の
 * プロトコルと衝突しない stderr へ出す）。
 */
export function recordAgentSearchEvent(
  db: { run(sql: string, params?: ReadonlyArray<string | number | null>): void },
  params: { query: string; hitEntityIds: readonly string[] },
): boolean {
  try {
    db.run(
      `INSERT INTO caravan_search_events (id, occurred_at, kind, query, result_count, source, hit_entity_ids)
       VALUES (?, ?, 'search', ?, ?, 'agent', ?)`,
      [
        randomUUID(),
        new Date().toISOString(),
        params.query,
        params.hitEntityIds.length,
        JSON.stringify(params.hitEntityIds.slice(0, AGENT_SEARCH_HIT_CAP)),
      ],
    );
    return true;
  } catch (err) {
    console.error(
      `[mcp-trail] agent search event record failed (query=${params.query}): ${
        err instanceof Error ? (err.stack ?? String(err)) : String(err)
      }`,
    );
    return false;
  }
}

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
    // 照会の記録（screen spec §2.5）。openCaravanBookDb は readwrite で open 時に
    // migration を流すため、この handle でそのまま INSERT できる。
    recordAgentSearchEvent(memHandle.db, {
      query: input.query,
      hitEntityIds: result.entities.map((e) => e.id),
    });
    return shapeSearchResponse(result, detail, aliases);
  } finally {
    memHandle.close();
  }
}
