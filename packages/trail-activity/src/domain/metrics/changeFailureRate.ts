import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildTimeSeries } from './timeSeriesUtils';
import {
  FIX_WINDOW_MS,
  filterCodeFiles,
  hasFileOverlap,
  isFailureCommit,
} from './failureCommit';

type Release = { id: string; tag_date: string; commit_hashes: string[] };
type Commit = {
  hash: string;
  subject: string;
  committed_at: string;
  files: string[];
};

type Inputs = {
  releases: Release[];
  commits: Commit[];
};

function computeRate(inputs: Inputs, range: DateRange): {
  value: number;
  sampleSize: number;
  failures: Array<{ date: string }>;
} {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const releasesInRange = inputs.releases.filter((r) => {
    const t = new Date(r.tag_date).getTime();
    return t >= fromMs && t <= toMs;
  });

  const commitMap = new Map(inputs.commits.map((c) => [c.hash, c]));
  const fixCommits = inputs.commits
    .filter((c) => isFailureCommit(c.subject))
    .map((c) => ({
      ms: new Date(c.committed_at).getTime(),
      codeFiles: filterCodeFiles(c.files),
    }))
    .filter((f) => !Number.isNaN(f.ms) && f.codeFiles.length > 0);

  const failures: Array<{ date: string }> = [];
  let measurable = 0;

  for (const release of releasesInRange) {
    const releaseFiles = new Set<string>();
    for (const hash of release.commit_hashes) {
      const c = commitMap.get(hash);
      if (!c) continue;
      for (const f of filterCodeFiles(c.files)) {
        releaseFiles.add(f);
      }
    }
    if (releaseFiles.size === 0) continue; // 判定不能 → sample から除外

    measurable += 1;
    const releaseMs = new Date(release.tag_date).getTime();
    const releaseFileArr = [...releaseFiles];
    const failed = fixCommits.some(
      (f) =>
        f.ms > releaseMs &&
        f.ms - releaseMs <= FIX_WINDOW_MS &&
        hasFileOverlap(releaseFileArr, f.codeFiles),
    );
    if (failed) failures.push({ date: release.tag_date });
  }

  const value = measurable === 0 ? 0 : (failures.length / measurable) * 100;
  return { value, sampleSize: measurable, failures };
}

export function computeChangeFailureRate(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const { value, sampleSize, failures } = computeRate(inputs, range);
  const level = sampleSize > 0
    ? classifyDoraLevel('changeFailureRate', value, thresholds)
    : undefined;

  const timeSeries = buildTimeSeries(
    failures.map((f) => ({ date: f.date, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeRate(previousInputs, previousRange);
    // prev.value === 0 (前期間が 0%) を除外しないと Infinity/NaN になり
    // 比較表示や JSON シリアライズが壊れるため両方ガードする。
    const deltaPct =
      prev.sampleSize === 0 || prev.value === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'changeFailureRate',
    value,
    unit: 'percent',
    sampleSize,
    level,
    comparison,
    timeSeries,
  };
}
