import { extractCommitPrefix } from '@anytime-markdown/trail-activity/domain/model/commitPrefix';

// ---------------------------------------------------------------------------
// Quality Rates
// ---------------------------------------------------------------------------

export interface QualityRateRow {
  readonly period: string;
  readonly retryRate: number | null;
  readonly buildFailRate: number | null;
  readonly testFailRate: number | null;
}

type QualityEntry = {
  buildRuns: number;
  buildFails: number;
  testRuns: number;
  testFails: number;
  edits: number;
  retries: number;
};

/**
 * SQL から取得した生行配列を受け取り、期間別の品質指標を計算して返す。
 * SQLite に依存しない純粋関数。
 *
 * @param buildTestRows - period / build_runs / build_fails / test_runs / test_fails を持つ行
 * @param editRows      - period / total_edits を持つ行
 * @param retryRows     - period / total_retries を持つ行
 */
export function aggregateQualityRates(
  buildTestRows: readonly Record<string, unknown>[],
  editRows: readonly Record<string, unknown>[],
  retryRows: readonly Record<string, unknown>[],
): readonly QualityRateRow[] {
  const qualityMap = new Map<string, QualityEntry>();
  const getEntry = (p: string): QualityEntry => {
    const cur = qualityMap.get(p) ?? { buildRuns: 0, buildFails: 0, testRuns: 0, testFails: 0, edits: 0, retries: 0 };
    qualityMap.set(p, cur);
    return cur;
  };

  for (const r of buildTestRows) {
    const p = r['period'];
    const e = getEntry(p == null ? '' : String(p));
    e.buildRuns += Number(r['build_runs'] ?? 0);
    e.buildFails += Number(r['build_fails'] ?? 0);
    e.testRuns += Number(r['test_runs'] ?? 0);
    e.testFails += Number(r['test_fails'] ?? 0);
  }
  for (const r of editRows) {
    const p = r['period'];
    getEntry(p == null ? '' : String(p)).edits += Number(r['total_edits'] ?? 0);
  }
  for (const r of retryRows) {
    const p = r['period'];
    getEntry(p == null ? '' : String(p)).retries += Number(r['total_retries'] ?? 0);
  }

  return [...qualityMap.entries()]
    .map(([p, e]) => ({
      period: p,
      retryRate: e.edits > 0 ? (e.retries / e.edits) * 100 : null,
      buildFailRate: e.buildRuns > 0 ? (e.buildFails / e.buildRuns) * 100 : null,
      testFailRate: e.testRuns > 0 ? (e.testFails / e.testRuns) * 100 : null,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// ---------------------------------------------------------------------------
// Commit Prefix Stats
// ---------------------------------------------------------------------------

export interface CommitPrefixInput {
  readonly period: string;
  readonly subject: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

export interface CommitPrefixStat {
  readonly period: string;
  readonly prefix: string;
  readonly count: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

/**
 * コミット行の配列を受け取り、(期間, prefix) 別の LOC 集計を返す。
 * todayPeriod より大きい period のコミットはウィンドウ外なので除外する。
 * SQLite に依存しない純粋関数。
 *
 * @param commitRows  - period / subject / linesAdded / linesDeleted を持つ行
 * @param todayPeriod - 今日の期間キー（例: '2026-05-09' or '2026-W19'）
 */
// ---------------------------------------------------------------------------
// Commit Prefix Baseline (累積モード用: 表示期間外の全 commit を集計)
// ---------------------------------------------------------------------------

export interface CommitBaselineInput {
  readonly subject: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

export interface CommitPrefixBaseline {
  readonly prefix: string;
  readonly count: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

export interface CommitBaselineSummary {
  readonly perPrefix: readonly CommitPrefixBaseline[];
  readonly totalCount: number;
  readonly regressionCount: number;
}

const REGRESSION_FIX_RE = /^fix\([^)]*regression[^)]*\)/i;

export function aggregateCommitPrefixBaseline(
  rows: readonly CommitBaselineInput[],
): CommitBaselineSummary {
  const prefixMap = new Map<string, { count: number; linesAdded: number; linesDeleted: number }>();
  let totalCount = 0;
  let regressionCount = 0;
  for (const r of rows) {
    const prefix = extractCommitPrefix(r.subject);
    const cur = prefixMap.get(prefix) ?? { count: 0, linesAdded: 0, linesDeleted: 0 };
    cur.count += 1;
    cur.linesAdded += r.linesAdded;
    cur.linesDeleted += r.linesDeleted;
    prefixMap.set(prefix, cur);
    totalCount += 1;
    if (REGRESSION_FIX_RE.test(r.subject)) regressionCount += 1;
  }
  const perPrefix: CommitPrefixBaseline[] = [...prefixMap.entries()].map(([prefix, v]) => ({
    prefix,
    count: v.count,
    linesAdded: v.linesAdded,
    linesDeleted: v.linesDeleted,
  }));
  return { perPrefix, totalCount, regressionCount };
}

export function aggregateCommitPrefixStats(
  commitRows: readonly CommitPrefixInput[],
  todayPeriod: string,
): readonly CommitPrefixStat[] {
  const prefixMap = new Map<string, { count: number; linesAdded: number; linesDeleted: number }>();
  for (const c of commitRows) {
    if (c.period > todayPeriod) continue;
    const prefix = extractCommitPrefix(c.subject);
    const k = `${c.period}::${prefix}`;
    const cur = prefixMap.get(k) ?? { count: 0, linesAdded: 0, linesDeleted: 0 };
    cur.count += 1;
    cur.linesAdded += c.linesAdded;
    cur.linesDeleted += c.linesDeleted;
    prefixMap.set(k, cur);
  }
  return [...prefixMap.entries()].map(([k, v]) => {
    const sep = k.indexOf('::');
    return { period: k.slice(0, sep), prefix: k.slice(sep + 2), count: v.count, linesAdded: v.linesAdded, linesDeleted: v.linesDeleted };
  });
}

// ---------------------------------------------------------------------------
// getCombinedData のワークスペース解決と SQL 断片の組み立て
// ---------------------------------------------------------------------------

/**
 * ワークスペース選択肢と、フィルタ対象の repo_id 集合。
 *
 * 選択肢は「対象期間に作業があった repo」に限る（`repos` には解析対象やコミット先として
 * 登場しただけの行も溜まるため、テーブルをそのまま出すとワークスペースでない名前が並ぶ）。
 * 一方フィルタ対象は活動の有無に依らず解決する（worktree 由来の repo も親名で拾うため）。
 */
export interface WorkspaceScope {
  /** 選択肢として出す正規化済みワークスペース名（ロケール順）。 */
  readonly workspaces: string[];
  /** ワークスペース絞り込みが有効か（未指定・空文字は無効）。 */
  readonly hasWorkspaceFilter: boolean;
  /** IN 句へ埋め込む repo_id 列。該当なしは常偽の `-1`。 */
  readonly repoIdList: string;
}

export interface WorkspaceScopeInput {
  /** `SELECT repo_id, repo_name FROM activity_repos` の生値行。 */
  readonly repoRows: readonly unknown[][];
  /** 対象期間に活動があった repo_id。 */
  readonly activeRepoIds: ReadonlySet<number>;
  /** 選択中のワークスペース（正規化済みの名前）。 */
  readonly workspace: string | undefined;
  /** repo_name の worktree 正規化。 */
  readonly normalizeName: (name: string) => string;
  /** SQL 生値のテキスト化。 */
  readonly toText: (value: unknown) => string;
}

export function resolveWorkspaceScope(input: WorkspaceScopeInput): WorkspaceScope {
  const { repoRows, activeRepoIds, workspace, normalizeName, toText } = input;
  const workspaceNames = new Set<string>();
  const filterRepoIds: number[] = [];

  for (const row of repoRows) {
    const repoId = Number(row[0]);
    const name = normalizeName(toText(row[1] ?? ''));
    if (name === '') continue;
    if (activeRepoIds.has(repoId)) workspaceNames.add(name);
    if (workspace !== undefined && name === workspace) filterRepoIds.push(repoId);
  }

  const hasWorkspaceFilter = workspace !== undefined && workspace !== '';
  // 選択中のワークスペースは、期間を狭めて活動が範囲外になっても一覧に残す
  // （select の表示値が選択肢に無い状態＝空欄表示になるのを防ぐ）。
  if (hasWorkspaceFilter && filterRepoIds.length > 0) workspaceNames.add(workspace);

  return {
    workspaces: [...workspaceNames].sort((a, b) => a.localeCompare(b)),
    hasWorkspaceFilter,
    // Number() 経由のため SQL 安全。
    repoIdList: filterRepoIds.length > 0 ? filterRepoIds.join(',') : '-1',
  };
}

/**
 * getCombinedData の各クエリへ差し込む SQL 断片。
 *
 * コミットの絞り込みは「コミット先の repo」ではなく「打ったセッションの repo」で行う。
 * コミット先 repo で絞ると、docs や `~/.claude` のような「ワークスペースでない宛先」への
 * コミットがどのワークスペースを選んでも現れず、各ワークスペースの合計が全体と一致しなくなる。
 */
export interface CombinedDataSqlFragments {
  /** sessions を `s` として JOIN 済みのクエリ用。 */
  readonly sessionRepoFilter: string;
  /** activity_session_commits を sessions と JOIN 済みのクエリ用。 */
  readonly commitScRepoFilter: string;
  readonly commitCRepoFilter: string;
  /** sessions を JOIN していないクエリ用（session_id 経由で同じ条件を表す）。 */
  readonly commitBareRepoFilter: string;
  readonly sessionStartPeriodExpr: string;
  readonly commitPeriodExpr: string;
}

export function buildCombinedDataSqlFragments(
  scope: Pick<WorkspaceScope, 'hasWorkspaceFilter' | 'repoIdList'>,
  period: 'day' | 'week',
  tzOffset: string,
): CombinedDataSqlFragments {
  const { hasWorkspaceFilter, repoIdList } = scope;
  const sessionScoped = hasWorkspaceFilter ? ` AND s.repo_id IN (${repoIdList})` : '';
  return {
    sessionRepoFilter: sessionScoped,
    commitScRepoFilter: sessionScoped,
    commitCRepoFilter: sessionScoped,
    commitBareRepoFilter: hasWorkspaceFilter
      ? ` AND session_id IN (SELECT id FROM activity_sessions WHERE repo_id IN (${repoIdList}))`
      : '',
    sessionStartPeriodExpr:
      period === 'week'
        ? `strftime('%Y-W%W', s.start_time, '${tzOffset}')`
        : `DATE(s.start_time, '${tzOffset}')`,
    commitPeriodExpr:
      period === 'week'
        ? `strftime('%Y-W%W', committed_at, '${tzOffset}')`
        : `DATE(committed_at, '${tzOffset}')`,
  };
}

/** (period, tool) 単位に集約したツール使用量。 */
export interface ToolCountRow {
  period: string;
  tool: string;
  count: number;
  tokens: number;
  durationMs: number;
  tokenMissingRate: number;
  tokenTotalTurns: number;
  tokenMissingTurns: number;
}

/**
 * ツール使用量の生行を (period, tool) 単位へ集約する。
 *
 * トークンは「観測できたターンの比率」で外挿する（`totalTurns / observedTurns` 倍）。
 * 観測ターンが 0 の場合は外挿できないので等倍にする。
 */
export function aggregateToolCounts(
  rawRows: readonly Record<string, unknown>[],
  toText: (value: unknown) => string,
): ToolCountRow[] {
  interface Entry {
    count: number;
    durationMs: number;
    adjustedTokens: number;
    totalTurns: number;
    missingTurns: number;
  }
  const byPeriodAndTool = new Map<string, Entry>();

  for (const r of rawRows) {
    const totalTurns = Number(r['token_total_turns'] ?? 0);
    const missingTurns = Number(r['token_missing_turns'] ?? 0);
    const observedTurns = totalTurns - missingTurns;
    const factor = observedTurns > 0 ? totalTurns / observedTurns : 1;
    const key = `${toText(r['period'] ?? '')}|${toText(r['tool'] ?? '')}`;
    const cur = byPeriodAndTool.get(key) ?? {
      count: 0,
      durationMs: 0,
      adjustedTokens: 0,
      totalTurns: 0,
      missingTurns: 0,
    };
    cur.count += Number(r['count'] ?? 0);
    cur.durationMs += Number(r['duration_ms'] ?? 0);
    cur.adjustedTokens += Number(r['tokens'] ?? 0) * factor;
    cur.totalTurns += totalTurns;
    cur.missingTurns += missingTurns;
    byPeriodAndTool.set(key, cur);
  }

  return [...byPeriodAndTool.entries()].map(([key, e]) => {
    const sep = key.indexOf('|');
    return {
      period: key.slice(0, sep),
      tool: key.slice(sep + 1),
      count: e.count,
      tokens: Math.round(e.adjustedTokens),
      durationMs: e.durationMs,
      tokenMissingRate: e.totalTurns > 0 ? e.missingTurns / e.totalTurns : 0,
      tokenTotalTurns: e.totalTurns,
      tokenMissingTurns: e.missingTurns,
    };
  });
}

/** 期間内のコミット 1 件（`activity_commit_files` の割り当て前）。 */
export interface CommitRow {
  period: string;
  repoName: string;
  hash: string;
  /** コミットメッセージの 1 行目。 */
  subject: string;
  committed_at: string;
  is_ai_assisted: boolean;
  linesAdded: number;
  linesDeleted: number;
  files: string[];
}

/** `activity_session_commits` の集計行をコミット行へ写す。ファイル一覧は {@link attachCommitFiles} が埋める。 */
export function toCommitRows(
  rows: readonly Record<string, unknown>[],
  toText: (value: unknown) => string,
): CommitRow[] {
  return rows.map((r) => ({
    period: toText(r['period'] ?? ''),
    repoName: toText(r['repo_name'] ?? ''),
    hash: toText(r['commit_hash'] ?? ''),
    subject: toText(r['commit_message'] ?? '').split('\n')[0],
    committed_at: toText(r['committed_at'] ?? ''),
    is_ai_assisted: Number(r['is_ai_assisted'] ?? 0) === 1,
    linesAdded: Number(r['lines_added'] ?? 0),
    linesDeleted: Number(r['lines_deleted'] ?? 0),
    files: [],
  }));
}

/** {@link attachCommitFiles} が書き戻す対象。`repoName` と `hash` の組でファイル一覧を引く。 */
export interface CommitFilesTarget {
  readonly repoName: string;
  readonly hash: string;
  files: string[];
}

/**
 * `activity_commit_files` の行を (repo_name, commit_hash) で束ね、対応するコミット行へ割り当てる。
 *
 * Phase H-4 で `activity_commit_files.repo_name` 列は撤去されたため、呼び出し側は `repos` を LEFT JOIN して
 * repo_name を射影する。キーに repo_name を含めるのは、同じハッシュが複数リポジトリに現れうるため。
 *
 * @param fileRows `[repo_name, commit_hash, file_path]` の生値行
 */
export function attachCommitFiles(
  commitRows: readonly CommitFilesTarget[],
  fileRows: readonly unknown[][],
  toText: (value: unknown) => string,
): void {
  const byCommit = new Map<string, string[]>();
  for (const row of fileRows) {
    const key = `${toText(row[0] ?? '')}:${toText(row[1] ?? '')}`;
    const filePath = toText(row[2] ?? '');
    const list = byCommit.get(key);
    if (list) list.push(filePath);
    else byCommit.set(key, [filePath]);
  }
  for (const commit of commitRows) {
    commit.files = byCommit.get(`${commit.repoName}:${commit.hash}`) ?? [];
  }
}

/** 期間ごとのツール別エラー件数。`rate` は呼び出し側が後から埋める。 */
export interface ErrorRateRow {
  period: string;
  rate: number;
  byTool: Record<string, number>;
}

/**
 * エラー件数の生行を期間 × ツールへ集約する。件数 0 の行は落とす
 * （GROUP BY の結果として 0 が出ることは無いが、集計の入口で弾いておく）。
 */
export function aggregateErrorsByPeriod(
  rows: readonly Record<string, unknown>[],
  toText: (value: unknown) => string,
): ErrorRateRow[] {
  const byPeriod = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const errCount = Number(r['err_count'] ?? 0);
    if (errCount === 0) continue;
    const period = toText(r['period'] ?? '');
    const tool = toText(r['tool'] ?? '');
    const byTool = byPeriod.get(period) ?? {};
    byTool[tool] = (byTool[tool] ?? 0) + errCount;
    byPeriod.set(period, byTool);
  }
  return [...byPeriod.entries()].map(([period, byTool]) => ({ period, rate: 0, byTool }));
}

/** 退行修正コミット（`fix(...regression...)`）の件名パターン。 */
const COMMIT_REGRESSION_FIX_RE = /^fix\([^)]*regression[^)]*\)/i;

/**
 * 期間ごとの退行修正コミット数（累積モードの右軸・退行率の分子）。
 *
 * `todayPeriod` より後ろの期間は落とす。集計期間の末尾は「まだ終わっていない期間」で、
 * 分母（全コミット数）が確定していないため、率が跳ねる。
 */
export function countRegressionFixesByPeriod(
  commitRows: readonly { period: string; subject: string }[],
  todayPeriod: string,
): { period: string; count: number }[] {
  const byPeriod = new Map<string, number>();
  for (const c of commitRows) {
    if (c.period > todayPeriod) continue;
    if (!COMMIT_REGRESSION_FIX_RE.test(c.subject)) continue;
    byPeriod.set(c.period, (byPeriod.get(c.period) ?? 0) + 1);
  }
  return [...byPeriod.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));
}
