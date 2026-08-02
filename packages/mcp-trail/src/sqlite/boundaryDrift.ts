import type { Database } from 'better-sqlite3';

import { all, get } from './sqlJsUtil';

export type BoundaryDriftKind = 'boundary_spanning' | 'package_fragmentation';

export interface BoundaryDriftBreakdownEntry {
  readonly key: string;
  readonly nodeCount: number;
}

export interface BoundaryDriftEntry {
  readonly kind: BoundaryDriftKind;
  /** boundary_spanning ならコミュニティ id、package_fragmentation ならパッケージ名。 */
  readonly target: string;
  /** 再クラスタリングを跨いだ同一性追跡用。boundary_spanning のみ。未解決は空文字。 */
  readonly stableKey: string;
  readonly detectedAt: string;
  readonly severity: number;
  readonly nodeCount: number;
  readonly spanCount: number | null;
  readonly dominance: number | null;
  readonly communityCount: number | null;
  /** 「どこと混ざっているか」の内訳。降順。 */
  readonly breakdown: readonly BoundaryDriftBreakdownEntry[];
}

export interface BoundaryDriftListOptions {
  readonly repoName?: string;
  readonly kind?: BoundaryDriftKind;
  readonly minSeverity?: number;
  /** false にすると過去の検出回も含めて返す（推移を見るとき）。既定は最新回のみ。 */
  readonly latestOnly?: boolean;
  readonly limit?: number;
}

export interface BoundaryDriftListResult {
  /** latestOnly のとき、対象にした検出時刻。該当が無ければ null。 */
  readonly detectedAt: string | null;
  readonly warnings: readonly BoundaryDriftEntry[];
  /**
   * 空結果の理由。空配列だけでは「境界が健全」と「まだ解析していない」を
   * 区別できないため、呼び手（AI）が誤読しないよう明示する。
   */
  readonly reason?: 'no-table' | 'unknown-repo' | 'no-detection';
}

const DEFAULT_LIMIT = 50;

interface WarningRow {
  readonly kind: string;
  readonly target_key: string;
  readonly stable_key: string;
  readonly detected_at: string;
  readonly severity: number;
  readonly node_count: number;
  readonly span_count: number | null;
  readonly dominance: number | null;
  readonly community_count: number | null;
  readonly breakdown_json: string;
}

/**
 * boundary_drift_warnings を severity 降順で読む。
 *
 * 履歴テーブル（解析のたびに 1 世代積まれる）なので、既定では最新の検出時刻に
 * 属する行だけを返す。全世代を混ぜると同じコミュニティが何度も並び、
 * 「今どうなっているか」を読めなくなるため。
 */
export function listBoundaryDriftDirect(
  db: Database,
  options: BoundaryDriftListOptions = {},
): BoundaryDriftListResult {
  if (!tableExists(db, 'boundary_drift_warnings')) {
    return { detectedAt: null, warnings: [], reason: 'no-table' };
  }

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  let repoId: number | undefined;
  if (options.repoName !== undefined) {
    const found = lookupRepoId(db, options.repoName);
    if (found === null) return { detectedAt: null, warnings: [], reason: 'unknown-repo' };
    repoId = found;
    conditions.push('repo_id = ?');
    params.push(found);
  }
  if (options.kind !== undefined) {
    conditions.push('kind = ?');
    params.push(options.kind);
  }
  if (options.minSeverity !== undefined) {
    conditions.push('severity >= ?');
    params.push(options.minSeverity);
  }

  const latestOnly = options.latestOnly ?? true;
  let detectedAt: string | null = null;
  if (latestOnly) {
    // 最新回の特定は kind / minSeverity で絞る前に行う。絞り込み後の最大値を採ると、
    // 「今回は軽い警告しか出ていない」ケースで古い世代へ遡ってしまう。
    detectedAt = latestDetectedAt(db, repoId);
    if (detectedAt === null) return { detectedAt: null, warnings: [], reason: 'no-detection' };
    conditions.push('detected_at = ?');
    params.push(detectedAt);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? DEFAULT_LIMIT;
  const rows = all<WarningRow>(
    db,
    `SELECT kind, target_key, stable_key, detected_at, severity, node_count,
            span_count, dominance, community_count, breakdown_json
       FROM boundary_drift_warnings
       ${where}
      ORDER BY severity DESC, kind ASC, target_key ASC
      LIMIT ?`,
    [...params, limit],
  );

  return { detectedAt, warnings: rows.map(toEntry) };
}

function toEntry(row: WarningRow): BoundaryDriftEntry {
  return {
    kind: row.kind as BoundaryDriftKind,
    target: row.target_key,
    stableKey: row.stable_key,
    detectedAt: row.detected_at,
    severity: row.severity,
    nodeCount: row.node_count,
    spanCount: row.span_count,
    dominance: row.dominance,
    communityCount: row.community_count,
    breakdown: JSON.parse(row.breakdown_json) as BoundaryDriftBreakdownEntry[],
  };
}

function latestDetectedAt(db: Database, repoId: number | undefined): string | null {
  const row =
    repoId === undefined
      ? get<{ detected_at: string }>(db, 'SELECT MAX(detected_at) AS detected_at FROM boundary_drift_warnings')
      : get<{ detected_at: string }>(
          db,
          'SELECT MAX(detected_at) AS detected_at FROM boundary_drift_warnings WHERE repo_id = ?',
          [repoId],
        );
  return row?.detected_at ?? null;
}

/** 参照専用なので repos へ upsert しない。未登録 repo は null（空結果）を返す。 */
function lookupRepoId(db: Database, repoName: string): number | null {
  const row = get<{ repo_id: number }>(db, 'SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
  return row ? Number(row.repo_id) : null;
}

function tableExists(db: Database, name: string): boolean {
  const row = get<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return row !== undefined;
}
