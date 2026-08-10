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

export interface BoundaryDriftRunSummary {
  readonly repoName: string;
  readonly detectedAt: string;
  readonly warningCount: number;
  readonly nodeCount: number;
}

export interface BoundaryDriftListResult {
  /**
   * 対象にした検出時刻。repo を跨ぐと repo ごとに別の時刻になるため、
   * 単一 repo に絞ったときだけ値が入る（横断時は `runs` を見る）。
   */
  readonly detectedAt: string | null;
  /** 対象にした検出回（repo ごと 1 件）。警告 0 件の回も含む。 */
  readonly runs: readonly BoundaryDriftRunSummary[];
  readonly warnings: readonly BoundaryDriftEntry[];
  /**
   * 空結果の理由。空配列だけでは「境界が健全」と「まだ解析していない」を
   * 区別できないため、呼び手（AI）が誤読しないよう明示する。
   * `no-warnings` は最新の検出回が存在し、そのうえで警告ゼロ＝健全を意味する。
   */
  readonly reason?: 'no-table' | 'unknown-repo' | 'no-detection' | 'no-warnings';
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

/** repoName / kind / minSeverity の絞り込み結果。repoName が台帳に無ければ unknown-repo。 */
type BoundaryDriftFilter =
  | {
      kind: 'ok';
      conditions: string[];
      params: Array<string | number>;
      repoId: number | undefined;
    }
  | { kind: 'unknown-repo' };

/** 呼び出し側オプションを WHERE 条件とバインド値へ落とす。 */
function buildBoundaryDriftFilter(
  db: Database,
  options: BoundaryDriftListOptions,
): BoundaryDriftFilter {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  let repoId: number | undefined;
  if (options.repoName !== undefined) {
    const found = lookupRepoId(db, options.repoName);
    if (found === null) return { kind: 'unknown-repo' };
    repoId = found;
    conditions.push('w.repo_id = ?');
    params.push(found);
  }
  if (options.kind !== undefined) {
    conditions.push('w.kind = ?');
    params.push(options.kind);
  }
  if (options.minSeverity !== undefined) {
    conditions.push('w.severity >= ?');
    params.push(options.minSeverity);
  }
  return { kind: 'ok', conditions, params, repoId };
}

/**
 * activity_boundary_drift_warnings を severity 降順で読む。
 *
 * 履歴テーブル（解析のたびに 1 世代積まれる）なので、既定では最新の検出回に
 * 属する行だけを返す。全世代を混ぜると同じコミュニティが何度も並び、
 * 「今どうなっているか」を読めなくなるため。
 *
 * 最新回は警告行ではなく `activity_boundary_drift_runs`（警告 0 件でも積まれる）から
 * **repo ごとに**取る。警告行の MAX を採ると、警告が解消された repo は古い回に
 * 貼り付いたままになり、複数 repo では直近に解析された 1 repo 以外が消える。
 *
 * **severity は kind 内でのみ比較可能**（`boundary_spanning` は spanCount×(1-dominance)、
 * `package_fragmentation` は communityCount で尺度が違う）。そのため `minSeverity` は
 * `kind` を指定したときだけ受け付ける。
 */
export function listBoundaryDriftDirect(
  db: Database,
  options: BoundaryDriftListOptions = {},
): BoundaryDriftListResult {
  if (options.minSeverity !== undefined && options.kind === undefined) {
    throw new Error(
      'minSeverity requires kind: severity is comparable only within a kind ' +
        '(boundary_spanning = spanCount x (1 - dominance), package_fragmentation = communityCount)',
    );
  }
  if (!tableExists(db, 'activity_boundary_drift_warnings') || !tableExists(db, 'activity_boundary_drift_runs')) {
    return { detectedAt: null, runs: [], warnings: [], reason: 'no-table' };
  }

  const filter = buildBoundaryDriftFilter(db, options);
  if (filter.kind === 'unknown-repo') {
    return { detectedAt: null, runs: [], warnings: [], reason: 'unknown-repo' };
  }
  const { conditions, params, repoId } = filter;

  const latestOnly = options.latestOnly ?? true;
  const runs = latestOnly ? latestRuns(db, repoId) : [];
  if (latestOnly) {
    if (runs.length === 0) return { detectedAt: null, runs: [], warnings: [], reason: 'no-detection' };
    // 最新回の特定は kind / minSeverity の絞り込みと独立に行う。絞り込み後の最大値を
    // 採ると、最新回に該当種別の警告が無いときだけ古い世代へ遡ってしまう。
    conditions.push(
      `EXISTS (SELECT 1 FROM activity_boundary_drift_runs r
                WHERE r.repo_id = w.repo_id AND r.detected_at = w.detected_at
                  AND r.detected_at = (SELECT MAX(r2.detected_at) FROM activity_boundary_drift_runs r2
                                        WHERE r2.repo_id = w.repo_id))`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? DEFAULT_LIMIT;
  const rows = all<WarningRow>(
    db,
    `SELECT w.kind, w.target_key, w.stable_key, w.detected_at, w.severity, w.node_count,
            w.span_count, w.dominance, w.community_count, w.breakdown_json
       FROM activity_boundary_drift_warnings w
       ${where}
      ORDER BY w.severity DESC, w.kind ASC, w.target_key ASC
      LIMIT ?`,
    [...params, limit],
  );

  const detectedAt = runs.length === 1 ? runs[0].detectedAt : null;
  const warnings = rows.map(toEntry);
  // 最新回はあるのに警告が無い＝健全。未解析（no-detection）と読み分けられるようにする。
  const reason = latestOnly && warnings.length === 0 ? ('no-warnings' as const) : undefined;
  return { detectedAt, runs, warnings, ...(reason === undefined ? {} : { reason }) };
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

/** repo ごとの最新検出回。repoId 省略時は全 repo 分（それぞれの最新回）を返す。 */
function latestRuns(db: Database, repoId: number | undefined): BoundaryDriftRunSummary[] {
  const where = repoId === undefined ? '' : 'WHERE r.repo_id = ?';
  const params = repoId === undefined ? [] : [repoId];
  return all<{
    repo_name: string | null;
    detected_at: string;
    warning_count: number;
    node_count: number;
  }>(
    db,
    `SELECT activity_repos.repo_name AS repo_name, r.detected_at, r.warning_count, r.node_count
       FROM activity_boundary_drift_runs r
       LEFT JOIN activity_repos ON activity_repos.repo_id = r.repo_id
       ${where}
       ${where === '' ? 'WHERE' : 'AND'} r.detected_at = (
         SELECT MAX(r2.detected_at) FROM activity_boundary_drift_runs r2 WHERE r2.repo_id = r.repo_id
       )
      ORDER BY r.detected_at DESC`,
    params,
  ).map((row) => ({
    repoName: row.repo_name ?? '',
    detectedAt: row.detected_at,
    warningCount: row.warning_count,
    nodeCount: row.node_count,
  }));
}

/** 参照専用なので repos へ upsert しない。未登録 repo は null（空結果）を返す。 */
function lookupRepoId(db: Database, repoName: string): number | null {
  const row = get<{ repo_id: number }>(db, 'SELECT repo_id FROM activity_repos WHERE repo_name = ?', [repoName]);
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
