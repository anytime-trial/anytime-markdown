import { extractCommitPrefix } from '@anytime-markdown/trail-core/domain/model/commitPrefix';

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
    const e = getEntry(String(r['period'] ?? ''));
    e.buildRuns += Number(r['build_runs'] ?? 0);
    e.buildFails += Number(r['build_fails'] ?? 0);
    e.testRuns += Number(r['test_runs'] ?? 0);
    e.testFails += Number(r['test_fails'] ?? 0);
  }
  for (const r of editRows) {
    getEntry(String(r['period'] ?? '')).edits += Number(r['total_edits'] ?? 0);
  }
  for (const r of retryRows) {
    getEntry(String(r['period'] ?? '')).retries += Number(r['total_retries'] ?? 0);
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
