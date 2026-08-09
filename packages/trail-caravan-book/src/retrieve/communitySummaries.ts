/**
 * コミュニティ要約（T-22・spec §6.6）。
 *
 * Louvain コミュニティ（caravan_entity_layout.community_id）へ operator 駆動で
 * name / summary を後付けするための列挙・upsert と、検索・API が名前を引くための
 * 解決ヘルパ。鍵は stable_key（メンバー集合ハッシュ）— layout の洗い替えで
 * community_id が再採番されても、同じメンバー集合なら要約が引き継がれる。
 */
import { computeStableKey } from '@anytime-markdown/trail-activity/codeGraph';
import type { CaravanDbConnection } from '../db/connection/types';
import { isLowInformationEntity } from '../canonical/entityQuality';

export interface CommunitySampleMember {
  display_name: string;
  type: string;
  degree: number;
}

export interface CaravanCommunity {
  community_id: number;
  graph_version: string;
  stable_key: string;
  member_count: number;
  /** 既存要約（無ければ null） */
  name: string | null;
  summary: string | null;
  /** 次数上位の代表メンバー（低情報名は除外） */
  sample_members: CommunitySampleMember[];
}

export interface ListCommunitiesOptions {
  /** これ未満のコミュニティは列挙しない（既定 10 = 段階付与の初回対象） */
  minSize?: number;
  /** 要約が未付与のコミュニティだけを返す */
  unsummarizedOnly?: boolean;
  /** 代表メンバー標本の件数（既定 8） */
  sampleSize?: number;
}

const DEFAULT_MIN_SIZE = 10;
const DEFAULT_SAMPLE_SIZE = 8;

function tableExists(db: CaravanDbConnection, name: string): boolean {
  const rows = db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return (rows[0]?.values.length ?? 0) > 0;
}

/** 現行の graph_version（layout が空なら null）。 */
function currentGraphVersion(db: CaravanDbConnection): string | null {
  const rows = db.exec(
    `SELECT graph_version FROM caravan_entity_layout
     GROUP BY graph_version ORDER BY MAX(recorded_at) DESC LIMIT 1`,
  );
  const v = rows[0]?.values[0]?.[0];
  return typeof v === 'string' ? v : null;
}

/** 現行版のコミュニティ → メンバー entity_id 集合。 */
function collectCommunities(db: CaravanDbConnection, graphVersion: string): Map<number, string[]> {
  const rows = db.exec(
    `SELECT community_id, entity_id FROM caravan_entity_layout WHERE graph_version = ?`,
    [graphVersion],
  );
  const byCommunity = new Map<number, string[]>();
  for (const row of rows[0]?.values ?? []) {
    const communityId = Number(row[0]);
    const members = byCommunity.get(communityId) ?? [];
    members.push(String(row[1]));
    byCommunity.set(communityId, members);
  }
  return byCommunity;
}

/**
 * 既存要約行を現行版の所属へ更新する（再関連付け）。
 * layout 洗い替え後の (graph_version, community_id) キャッシュを追従させる。
 */
function reassociateSummaries(
  db: CaravanDbConnection,
  communities: ReadonlyMap<number, string[]>,
  graphVersion: string,
  keys: ReadonlyMap<number, string>,
  now: string,
): void {
  for (const [communityId, members] of communities) {
    const stableKey = keys.get(communityId);
    if (stableKey === undefined) continue;
    db.run(
      `UPDATE caravan_community_summaries
       SET graph_version = ?, community_id = ?, member_count = ?, updated_at = ?
       WHERE stable_key = ?
         AND (graph_version != ? OR community_id != ? OR member_count != ?)`,
      [graphVersion, communityId, members.length, now, stableKey, graphVersion, communityId, members.length],
    );
  }
}

export function listCaravanCommunities(
  db: CaravanDbConnection,
  options: ListCommunitiesOptions = {},
): CaravanCommunity[] {
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const graphVersion = currentGraphVersion(db);
  if (graphVersion === null) return [];

  const all = collectCommunities(db, graphVersion);
  const eligible = new Map([...all].filter(([, members]) => members.length >= minSize));
  const keys = new Map([...eligible].map(([id, members]) => [id, computeStableKey(members)] as const));
  reassociateSummaries(db, eligible, graphVersion, keys, new Date().toISOString());

  const result: CaravanCommunity[] = [];
  for (const [communityId, members] of eligible) {
    const stableKey = keys.get(communityId);
    if (stableKey === undefined) continue;
    const summaryRows = db.exec(
      `SELECT name, summary FROM caravan_community_summaries WHERE stable_key = ?`,
      [stableKey],
    );
    const summaryRow = summaryRows[0]?.values[0];
    if (options.unsummarizedOnly === true && summaryRow !== undefined) continue;

    // 標本は次数上位から取り、低情報名（「不明」等のプレースホルダ）を除いて
    // sampleSize 件へ絞る。除外分を見込んで 3 倍を先読みする。
    const memberRows = db.exec(
      `SELECT e.display_name, e.type, l.degree, e.summary
       FROM caravan_entity_layout l
       JOIN caravan_entities e ON e.id = l.entity_id
       WHERE l.graph_version = ? AND l.community_id = ?
       ORDER BY l.degree DESC, e.display_name ASC
       LIMIT ?`,
      [graphVersion, communityId, sampleSize * 3],
    );
    const sampleMembers: CommunitySampleMember[] = [];
    for (const row of memberRows[0]?.values ?? []) {
      if (sampleMembers.length >= sampleSize) break;
      const displayName = String(row[0]);
      if (isLowInformationEntity(displayName, String(row[3] ?? ''))) continue;
      sampleMembers.push({ display_name: displayName, type: String(row[1]), degree: Number(row[2]) });
    }

    result.push({
      community_id: communityId,
      graph_version: graphVersion,
      stable_key: stableKey,
      member_count: members.length,
      name: summaryRow === undefined ? null : String(summaryRow[0]),
      summary: summaryRow === undefined ? null : String(summaryRow[1]),
      sample_members: sampleMembers,
    });
  }
  return result.sort(
    (a, b) => b.member_count - a.member_count || a.community_id - b.community_id,
  );
}

export interface CommunitySummaryUpsert {
  stable_key: string;
  name: string;
  summary: string;
}

export interface UpsertCommunitySummariesResult {
  upserted: number;
  /** 現行版のどのコミュニティにも一致しなかった鍵（書き込まない） */
  skipped_stable_keys: string[];
}

export function upsertCaravanCommunitySummaries(
  db: CaravanDbConnection,
  rows: readonly CommunitySummaryUpsert[],
  options: { now?: string } = {},
): UpsertCommunitySummariesResult {
  const now = options.now ?? new Date().toISOString();
  const graphVersion = currentGraphVersion(db);
  const result: UpsertCommunitySummariesResult = { upserted: 0, skipped_stable_keys: [] };
  if (graphVersion === null) {
    result.skipped_stable_keys = rows.map((r) => r.stable_key);
    return result;
  }

  const byStableKey = new Map<string, { community_id: number; member_count: number }>();
  for (const [communityId, members] of collectCommunities(db, graphVersion)) {
    byStableKey.set(computeStableKey(members), {
      community_id: communityId,
      member_count: members.length,
    });
  }

  for (const row of rows) {
    const mapping = byStableKey.get(row.stable_key);
    if (mapping === undefined) {
      // 現行版に実在しないコミュニティは書き込まない（参照整合はアプリ層で担保。
      // 黙って捨てず戻り値で報告する）
      result.skipped_stable_keys.push(row.stable_key);
      continue;
    }
    db.run(
      `INSERT INTO caravan_community_summaries
         (stable_key, name, summary, member_count, graph_version, community_id, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stable_key) DO UPDATE SET
         name = excluded.name,
         summary = excluded.summary,
         member_count = excluded.member_count,
         graph_version = excluded.graph_version,
         community_id = excluded.community_id,
         generated_at = excluded.generated_at,
         updated_at = excluded.updated_at`,
      [row.stable_key, row.name, row.summary, mapping.member_count, graphVersion, mapping.community_id, now, now],
    );
    result.upserted += 1;
  }
  return result;
}

/**
 * エンティティ ID → 所属コミュニティ名（要約が現行版に存在する場合のみ）。
 * 検索応答への community.name 同梱に使う。summaries テーブルが無い DB
 * （migration 028 未適用）では空を返し、検索全体を失敗させない。
 */
export function fetchCommunityNames(
  db: CaravanDbConnection,
  entityIds: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (entityIds.length === 0) return map;
  if (!tableExists(db, 'caravan_community_summaries') || !tableExists(db, 'caravan_entity_layout')) {
    return map;
  }
  const rows = db.exec(
    `SELECT l.entity_id, s.name
     FROM caravan_entity_layout l
     JOIN caravan_community_summaries s
       ON s.graph_version = l.graph_version AND s.community_id = l.community_id
     WHERE l.entity_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(entityIds)],
  );
  for (const row of rows[0]?.values ?? []) {
    map.set(String(row[0]), String(row[1]));
  }
  return map;
}
