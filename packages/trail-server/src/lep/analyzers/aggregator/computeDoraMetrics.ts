import type {
  DoraCommitInput,
  DoraMetricRow,
  DoraReleaseInput,
} from '@anytime-markdown/trail-db';

import { compareStr, groupBy, median } from './utils';

/**
 * DORA 指標 (deployment frequency / lead time for changes) を月次で算出する純粋関数。
 *
 * 算出する指標 (Step 4a):
 * - **deployment frequency**: 期間 (YYYY-MM) 内の release 件数
 * - **lead time for changes**: commit → それを含む最初の release までの経過時間の中央値 (時間)
 *
 * change_failure_rate / mttr は bug → release attribution リンクが実データに無いため
 * 本 Step では算出しない (lep-step4 プラン §6.1.1 / フォローアップ)。
 *
 * 設計方針 (code-quality.md §16): SQL は単純な範囲スキャンに留め、月次バケツ化と
 * 中央値算出は TS 側で行う。release を repo ごとに releasedAt 昇順でソートし、各 commit を
 * 「committedAt 以降で最初の release」(= 最初に deploy される release) に二分探索で割り当て、
 * その release の period に lead time を集計する。
 *
 * @param releases `released_at` が有効な release (NULL / 空文字は呼び出し側で除外済み)
 * @param commits  `committed_at` が有効な commit (repo × hash で重複排除済み)
 * @param computedAt 算出日時 (ISO 8601 + Z)。全行に同じ値を入れる
 */
export function computeDoraMetrics(
  releases: readonly DoraReleaseInput[],
  commits: readonly DoraCommitInput[],
  computedAt: string,
): DoraMetricRow[] {
  const releasesByRepo = groupBy(releases, (r) => r.repoName);
  const commitsByRepo = groupBy(commits, (c) => c.repoName);

  const rows: DoraMetricRow[] = [];

  for (const [repoName, repoReleases] of releasesByRepo) {
    const sorted = [...repoReleases].sort((a, b) => compareStr(a.releasedAt, b.releasedAt));
    const releaseTimes = sorted.map((r) => Date.parse(r.releasedAt));

    // deployment frequency: period (YYYY-MM) ごとの release 件数
    const deploymentsByPeriod = new Map<string, number>();
    for (const r of sorted) {
      const period = periodOf(r.releasedAt);
      deploymentsByPeriod.set(period, (deploymentsByPeriod.get(period) ?? 0) + 1);
    }

    // lead time: commit を「含有 release」に割り当て、その release の period に集計
    const leadTimesByPeriod = new Map<string, number[]>();
    for (const c of commitsByRepo.get(repoName) ?? []) {
      const committedMs = Date.parse(c.committedAt);
      if (Number.isNaN(committedMs)) continue;
      const idx = firstReleaseAtOrAfter(releaseTimes, committedMs);
      if (idx >= sorted.length) continue; // 最終 release より後の commit = 未 deploy
      const leadHours = (releaseTimes[idx] - committedMs) / 3_600_000;
      if (leadHours < 0 || Number.isNaN(leadHours)) continue;
      const period = periodOf(sorted[idx].releasedAt);
      const bucket = leadTimesByPeriod.get(period);
      if (bucket) bucket.push(leadHours);
      else leadTimesByPeriod.set(period, [leadHours]);
    }

    for (const [period, deploymentFrequency] of deploymentsByPeriod) {
      const leads = leadTimesByPeriod.get(period);
      const leadTimeHours =
        leads && leads.length > 0 ? round2(median(leads)) : null;
      rows.push({ repoName, period, deploymentFrequency, leadTimeHours, computedAt });
    }
  }

  // 決定的な順序 (repo → period 昇順) で返す
  rows.sort((a, b) => compareStr(a.repoName, b.repoName) || compareStr(a.period, b.period));
  return rows;
}

/** ISO 8601 文字列の先頭 7 文字 (YYYY-MM) を期間キーとして返す。 */
function periodOf(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

/**
 * 昇順ソート済みの release 時刻配列で、`targetMs` 以上となる最初の index を二分探索で返す
 * (lower_bound)。該当なしなら `times.length` を返す。
 */
function firstReleaseAtOrAfter(times: readonly number[], targetMs: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
