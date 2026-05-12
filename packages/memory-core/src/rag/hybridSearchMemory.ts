import type { MemoryDbConnection } from '../db/connection/types';
import type { OllamaClient } from '../ollama/client';
import {
  searchMemory,
  vectorTopK,
  type SearchInput,
  type SearchResult,
  type SearchEntity,
} from '../retrieve/searchMemory';
import { tokenizeForFts5 } from './tokenizeForFts5';
import { reciprocalRankFusion, type RankSource } from './reciprocalRankFusion';

export interface HybridSearchInput extends SearchInput {
  /** BM25 で取得する候補数。default 30 */
  readonly bm25_limit?: number;
  /** ベクトル検索で取得する候補数。default 30 */
  readonly vec_limit?: number;
  /** RRF の k パラメータ。default 60 */
  readonly rrf_k?: number;
  /** 融合後の最終件数。default 12 */
  readonly final_limit?: number;
}

export interface HybridSearchOptions {
  readonly db: MemoryDbConnection;
  readonly ollama: OllamaClient;
  readonly embedModel?: string;
  readonly input: HybridSearchInput;
}

interface FusedEntity extends SearchEntity {
  readonly sources: ReadonlyArray<RankSource>;
}

export interface HybridSearchResult extends SearchResult {
  readonly entities: FusedEntity[];
}

function tableExists(db: MemoryDbConnection, name: string): boolean {
  const r = db.exec(
    `SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`,
    [name],
  );
  return (r[0]?.values.length ?? 0) > 0;
}

function bm25Search(
  db: MemoryDbConnection,
  rawQuery: string,
  bm25Limit: number,
  filters: Pick<SearchInput, 'entity_types' | 'since'>,
): { id: string; rank: number }[] {
  if (!tableExists(db, 'memory_entities_fts')) return [];
  const ftsQuery = tokenizeForFts5(rawQuery);
  if (!ftsQuery) return [];

  const params: (string | number)[] = [ftsQuery];
  const conds: string[] = ['memory_entities_fts MATCH ?', 'e.valid_until IS NULL'];

  if (filters.entity_types && filters.entity_types.length > 0) {
    const placeholders = filters.entity_types.map(() => '?').join(', ');
    conds.push(`e.type IN (${placeholders})`);
    params.push(...filters.entity_types);
  }
  if (filters.since) {
    conds.push('e.last_updated_at >= ?');
    params.push(filters.since);
  }
  params.push(bm25Limit);

  const rows = db.exec(
    `SELECT e.id
       FROM memory_entities_fts f
       JOIN memory_entities e ON e.rowid = f.rowid
      WHERE ${conds.join(' AND ')}
      ORDER BY bm25(memory_entities_fts) ASC
      LIMIT ?`,
    params,
  );
  return (rows[0]?.values ?? []).map((r, i) => ({ id: r[0] as string, rank: i }));
}

function nowMs(): number {
  return Date.now();
}

function logPerf(ctx: Record<string, unknown>): void {
  if (process.env.MEMORY_CHAT_PERF_LOG === '0') return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [INFO] hybridSearchMemory ${JSON.stringify(ctx)}`);
}

export async function hybridSearchMemory(opts: HybridSearchOptions): Promise<HybridSearchResult> {
  const { db, ollama, embedModel, input } = opts;
  const bm25Limit = input.bm25_limit ?? 30;
  const vecLimit = input.vec_limit ?? 30;
  const rrfK = input.rrf_k ?? 60;
  const finalLimit = input.final_limit ?? 12;

  const t0 = nowMs();
  // 1. BM25 (FTS5)
  const bm25Hits = bm25Search(db, input.query, bm25Limit, {
    entity_types: input.entity_types,
    since: input.since,
  });
  const tBm25 = nowMs();

  // 2. Vector top-K
  const vecEntities = await vectorTopK({
    db,
    ollama,
    embedModel,
    input: {
      query: input.query,
      entity_types: input.entity_types,
      since: input.since,
    },
    limit: vecLimit,
  });
  const vecHits = vecEntities.map((e, i) => ({ id: e.id, rank: i }));
  const tVec = nowMs();

  // 3. RRF
  const fused = reciprocalRankFusion(bm25Hits, vecHits, rrfK).slice(0, finalLimit);
  const tRrf = nowMs();
  logPerf({
    bm25_ms: tBm25 - t0,
    vec_ms: tVec - tBm25,
    rrf_ms: tRrf - tVec,
    bm25_hits: bm25Hits.length,
    vec_hits: vecHits.length,
    fused_count: fused.length,
  });
  if (fused.length === 0) {
    return { entities: [], edges: [], episodes: [] };
  }

  // 4. Hydrate: BM25-only でヒットした id は entity 詳細を別途取得する。
  //    既に vec で取れている entity は vecEntities から再利用 (score 取得済)。
  const vecById = new Map(vecEntities.map((e) => [e.id, e]));
  const missingIds = fused.filter((f) => !vecById.has(f.id)).map((f) => f.id);
  const extraEntities = missingIds.length > 0 ? hydrateEntities(db, missingIds) : [];
  const extraById = new Map(extraEntities.map((e) => [e.id, e]));

  const entities: FusedEntity[] = [];
  for (const f of fused) {
    const base = vecById.get(f.id) ?? extraById.get(f.id);
    if (!base) continue;
    entities.push({ ...base, score: f.score, sources: f.sources });
  }

  // 5. hops=1 のときは searchMemory を fused id 集合で再実行して edges/episodes を取る
  if ((input.hops ?? 1) === 0) {
    return { entities, edges: [], episodes: [] };
  }

  const fullResult = await searchMemory({
    db,
    ollama,
    embedModel,
    input: {
      ...input,
      limit: finalLimit,
    },
  });
  const fusedIds = new Set(entities.map((e) => e.id));
  return {
    entities,
    edges: fullResult.edges.filter((e) => fusedIds.has(e.subject_id)),
    episodes: fullResult.episodes,
  };
}

function hydrateEntities(db: MemoryDbConnection, ids: string[]): SearchEntity[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.exec(
    `SELECT id, type, display_name, summary FROM memory_entities
       WHERE id IN (${placeholders}) AND valid_until IS NULL`,
    ids,
  );
  return (rows[0]?.values ?? []).map((row) => ({
    id: row[0] as string,
    type: row[1] as string,
    display_name: row[2] as string,
    summary: row[3] as string,
    score: 0,
  }));
}
