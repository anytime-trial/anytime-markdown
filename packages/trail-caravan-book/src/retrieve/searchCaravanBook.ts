import type { CaravanDbConnection, SqlValue } from '../db/connection/types';
import { toUint8ArrayOrNull } from '../db/connection/blobUtil';
import { decodeEmbedding } from '../embedding/codec';
import { cosineSimilarity } from '../embedding/cosine';
import { isLowInformationEntity } from '../canonical/entityQuality';
import type { OllamaClient } from '@anytime-markdown/agent-core';

export interface SearchInput {
  query: string;
  entity_types?: string[];
  source_type?: string;
  since?: string;    // ISO 8601, filter by last_updated_at
  limit?: number;    // default 20
  hops?: number;     // 0 or 1, default 1
}

export interface SearchEntity {
  id: string;
  type: string;
  display_name: string;
  summary: string;
  score: number;
  /** 所属コミュニティ（要約が付与済みの場合のみ同梱・T-22） */
  community?: { name: string };
}

export interface SearchEdge {
  id: string;
  subject_id: string;
  subject_name: string | null;
  predicate: string;
  object_id: string | null;
  object_name: string | null;
  object_literal: string | null;
  source_type: string;
  valid_from: string;
  source_ref: string;
  confidence_label: string;
}

export interface SearchEpisode {
  id: string;
  session_id: string;
  valid_from: string;
  raw_excerpt: string;
}

export interface SearchResult {
  entities: SearchEntity[];
  edges: SearchEdge[];
  episodes: SearchEpisode[];
}

interface EntityCandidate {
  id: string;
  type: string;
  display_name: string;
  summary: string;
  embedding: Uint8Array | null;
}

/**
 * 意味検索の候補プール。全 active エンティティ（4 万件超）の embedding を
 * 毎クエリ復号すると遅いため、直近更新分に限定して走査する。
 */
// SHORTCUT: 意味検索の候補を直近更新 500 件の貪欲プールに限定する. ceiling: それより古い実体は語彙一致(BM25 アーム)でしか到達できない. upgrade: 「古い実体が意味検索でヒットしない」報告か検索レイテンシ悪化を観測したら sqlite-vec 等の ANN 索引へ移行する.
const VECTOR_CANDIDATE_POOL = 500;

/** hops=1 で返すエッジの上限。トップエンティティ同士の辺を優先して残す */
const MAX_EDGES = 100;

/**
 * クエリベクトルに対しコサイン類似度で caravan_entities をランク付けし
 * 上位 `limit` 件を返す。RAG ハイブリッド検索からも参照される。
 * 候補は `last_updated_at DESC` の直近 VECTOR_CANDIDATE_POOL 件
 * （旧実装は ORDER BY なし LIMIT 200 で、実質 rowid 順＝最古の 200 件しか
 * 探索できず、完全一致すら取りこぼしていた）。
 * 低情報エンティティ（「不明のバグ」等のプレースホルダ名）は除外する。
 */
export async function vectorTopK(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  embedModel?: string;
  input: Pick<SearchInput, 'query' | 'entity_types' | 'since'>;
  limit: number;
}): Promise<SearchEntity[]> {
  const { db, ollama, embedModel, input, limit } = opts;

  const embResult = await ollama.embeddings({
    model: embedModel ?? 'bge-m3',
    prompt: input.query,
  });
  const queryVec = Float32Array.from(embResult.embedding);

  const conditions: string[] = ['valid_until IS NULL'];
  const params: (string | number | null)[] = [];

  if (input.entity_types && input.entity_types.length > 0) {
    const placeholders = input.entity_types.map(() => '?').join(', ');
    conditions.push(`type IN (${placeholders})`);
    params.push(...input.entity_types);
  }

  if (input.since) {
    conditions.push('last_updated_at >= ?');
    params.push(input.since);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sql = `SELECT id, type, display_name, summary, embedding FROM caravan_entities ${whereClause} ORDER BY last_updated_at DESC LIMIT ${VECTOR_CANDIDATE_POOL}`;
  const rows = db.exec(sql, params.length > 0 ? params : undefined);
  const rawRows = rows[0]?.values ?? [];

  const scored: Array<{ candidate: EntityCandidate; score: number }> = [];
  for (const row of rawRows) {
    const id = row[0] as string;
    const type = row[1] as string;
    const display_name = row[2] as string;
    const summary = row[3] as string;
    if (isLowInformationEntity(display_name, summary)) continue;
    const embBlob = toUint8ArrayOrNull(row[4]);
    if (embBlob == null) continue;

    let entityVec: Float32Array;
    try {
      entityVec = decodeEmbedding(embBlob);
    } catch (_) {
      continue;
    }
    let score: number;
    try {
      score = cosineSimilarity(queryVec, entityVec);
    } catch (_) {
      continue;
    }
    scored.push({
      candidate: { id, type, display_name, summary, embedding: embBlob },
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ candidate, score }) => ({
    id: candidate.id,
    type: candidate.type,
    display_name: candidate.display_name,
    summary: candidate.summary,
    score,
  }));
}

/**
 * トップエンティティ集合の周辺文脈（エッジ・エピソード）を取得する。
 * searchCaravanBook と hybridSearchCaravanBook の共通経路。
 *
 * - エッジはトップエンティティが subject / object どちら側でも対象にする
 *   （旧実装は subject 側のみで、ハブへ張られた辺が欠落していた）
 * - 両端の display_name を同梱する（hex ID だけの応答は後段で名前解決
 *   できず利用不能だった）
 * - 上限 MAX_EDGES 件。トップ同士を結ぶ辺 → 新しい辺の順で残す
 */
export function fetchGraphContext(
  db: CaravanDbConnection,
  topIds: string[],
  opts?: { maxEpisodesPerEntity?: number },
): { edges: SearchEdge[]; episodes: SearchEpisode[] } {
  if (topIds.length === 0) {
    return { edges: [], episodes: [] };
  }
  const maxEpisodesPerEntity = opts?.maxEpisodesPerEntity ?? 3;

  const ph = topIds.map(() => '?').join(', ');
  const edgeRows = db.exec(
    `SELECT ed.id, ed.subject_entity_id, sub.display_name AS subject_display_name, ed.predicate,
            ed.object_entity_id, obj.display_name AS object_display_name, ed.object_literal,
            ed.source_type, ed.valid_from, ed.source_ref, ed.confidence_label,
            (ed.subject_entity_id IN (${ph}) AND ed.object_entity_id IN (${ph})) AS both_top
       FROM caravan_edges ed
       LEFT JOIN caravan_entities sub ON sub.id = ed.subject_entity_id
       LEFT JOIN caravan_entities obj ON obj.id = ed.object_entity_id
      WHERE (ed.subject_entity_id IN (${ph}) OR ed.object_entity_id IN (${ph})) AND ed.valid_to IS NULL
      ORDER BY both_top DESC, ed.valid_from DESC
      LIMIT ${MAX_EDGES}`,
    [...topIds, ...topIds, ...topIds, ...topIds],
  );

  const edges: SearchEdge[] = (edgeRows[0]?.values ?? []).map((row) => ({
    id: row[0] as string,
    subject_id: row[1] as string,
    subject_name: row[2] as string | null,
    predicate: row[3] as string,
    object_id: row[4] as string | null,
    object_name: row[5] as string | null,
    object_literal: row[6] as string | null,
    source_type: row[7] as string,
    valid_from: row[8] as string,
    source_ref: row[9] as string,
    confidence_label: row[10] as string,
  }));

  // Episodes (cap per entity)。task-notification ダンプと短小エピソードは
  // 文脈として情報を持たないため選択から除外する（spec §7.5。「ok」「マージして」等が
  // 新着順で先頭を占めていた実測への対処）
  const epRows = db.exec(
    `SELECT ee.entity_id, me.id, me.session_id, me.valid_from, me.raw_excerpt
     FROM caravan_episode_entities ee
     JOIN caravan_episodes me ON me.id = ee.episode_id
     WHERE ee.entity_id IN (${ph})
       AND me.raw_excerpt NOT LIKE '<task-notification>%'
       AND length(me.raw_excerpt) >= 20
     ORDER BY me.valid_from DESC`,
    topIds,
  );

  const entityEpCount = new Map<string, number>();
  const seenEpisodeIds = new Set<string>();
  const episodes: SearchEpisode[] = [];

  for (const row of epRows[0]?.values ?? []) {
    const entityId = row[0] as string;
    const episodeId = row[1] as string;

    const count = entityEpCount.get(entityId) ?? 0;
    if (count >= maxEpisodesPerEntity) {
      continue;
    }

    // deduplicate episodes across entities
    if (seenEpisodeIds.has(episodeId)) {
      entityEpCount.set(entityId, count + 1);
      continue;
    }

    seenEpisodeIds.add(episodeId);
    entityEpCount.set(entityId, count + 1);

    episodes.push({
      id: episodeId,
      session_id: row[2] as string,
      valid_from: row[3] as string,
      raw_excerpt: row[4] as string,
    });
  }

  return { edges, episodes };
}

export async function searchCaravanBook(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  embedModel?: string;
  input: SearchInput;
}): Promise<SearchResult> {
  const { db, ollama, embedModel, input } = opts;
  const limit = input.limit ?? 20;

  const topEntities = await vectorTopK({ db, ollama, embedModel, input, limit });

  if ((input.hops ?? 1) === 0 || topEntities.length === 0) {
    return { entities: topEntities, edges: [], episodes: [] };
  }

  const { edges, episodes } = fetchGraphContext(db, topEntities.map((e) => e.id));
  return { entities: topEntities, edges, episodes };
}
