import { FIX_WINDOW_MS, filterCodeFiles, hasFileOverlap, isFailureCommit } from './failureCommit';
import type { DateRange } from './types';

export type ReleaseQualityBucket = {
  readonly bucketStart: string;
  readonly failed: number;
  readonly succeeded: number;
};

type Release = { tag_date: string };
type Commit = { hash: string; subject: string; committed_at: string; files: string[] };

function startOfDayUTC(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function startOfWeekUTC(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/** Collect code files from all commits attributed to a release window [prevMs, releaseMs]. */
function collectReleaseFiles(
  commits: readonly Commit[],
  prevMs: number,
  releaseMs: number,
): Set<string> {
  const releaseFiles = new Set<string>();
  for (const c of commits) {
    const cMs = new Date(c.committed_at).getTime();
    if (cMs < prevMs || cMs > releaseMs) continue;
    for (const f of filterCodeFiles(c.files)) releaseFiles.add(f);
  }
  return releaseFiles;
}

/** Initialize time-series buckets for the given range. */
function initBuckets(
  fromMs: number,
  toMs: number,
  bucketFn: (ms: number) => number,
  stepMs: number,
): Map<number, { failed: number; succeeded: number }> {
  const buckets = new Map<number, { failed: number; succeeded: number }>();
  let cursor = bucketFn(fromMs);
  while (cursor <= toMs) {
    buckets.set(cursor, { failed: 0, succeeded: 0 });
    cursor += stepMs;
  }
  return buckets;
}

/**
 * 各リリースを「時系列ベース帰属」アルゴリズムで成功/失敗に分類し、バケット集計して返す。
 *
 * 帰属ルール: 前リリース日〜当リリース日の間にコミットされたコミットをそのリリースの変更とみなす。
 * 判定: リリース後 168h 以内に、リリースの変更ファイルと重複するコードファイルへ
 *        fix / revert / hotfix コミットが入れば「失敗」、そうでなければ「成功」。
 * ファイルデータがないリリース（unmeasurable）は「成功」として計上する。
 */
export function computeReleaseQualityTimeSeries(
  inputs: { releases: Release[]; commits: Commit[] },
  range: DateRange,
  bucket: 'day' | 'week',
): ReleaseQualityBucket[] {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const bucketFn = bucket === 'day' ? startOfDayUTC : startOfWeekUTC;
  const stepMs = bucket === 'day' ? 86_400_000 : 7 * 86_400_000;

  const sortedReleases = [...inputs.releases].sort((a, b) => a.tag_date.localeCompare(b.tag_date));
  const releasesInRange = sortedReleases.filter((r) => {
    const t = new Date(r.tag_date).getTime();
    return t >= fromMs && t <= toMs;
  });

  if (releasesInRange.length === 0) return [];

  // fix コミット候補（コードファイルを変更したもの）
  const fixCandidates = inputs.commits
    .filter((c) => isFailureCommit(c.subject))
    .map((c) => ({ ms: new Date(c.committed_at).getTime(), codeFiles: filterCodeFiles(c.files) }))
    .filter((f) => f.codeFiles.length > 0);

  const buckets = initBuckets(fromMs, toMs, bucketFn, stepMs);

  let prevMs = fromMs;
  for (const release of releasesInRange) {
    const releaseMs = new Date(release.tag_date).getTime();
    const releaseFiles = collectReleaseFiles(inputs.commits, prevMs, releaseMs);
    const releaseFileArr = [...releaseFiles];

    // ファイルデータなし → unmeasurable として succeeded 扱い
    const failed =
      releaseFiles.size > 0 &&
      fixCandidates.some(
        (f) =>
          f.ms > releaseMs &&
          f.ms - releaseMs <= FIX_WINDOW_MS &&
          hasFileOverlap(releaseFileArr, f.codeFiles),
      );

    const acc = buckets.get(bucketFn(releaseMs));
    if (acc) {
      if (failed) acc.failed += 1;
      else acc.succeeded += 1;
    }

    prevMs = releaseMs;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ms, acc]) => ({
      bucketStart: new Date(ms).toISOString(),
      failed: acc.failed,
      succeeded: acc.succeeded,
    }));
}
