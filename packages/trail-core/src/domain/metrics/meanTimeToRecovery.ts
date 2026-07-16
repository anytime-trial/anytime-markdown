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

type Commit = {
  hash: string;
  subject: string;
  committed_at: string;
  files: string[];
};

type Inputs = {
  commits: Commit[];
};

const HOUR_MS = 3_600_000;

/**
 * コミットベース近似の MTTR。
 * 「復旧」= fix/revert/hotfix コミット、「障害混入」= その fix とコードファイル重複があり
 * 168h 以内で最も近い先行コミット。ペアリング不能な fix は母数から除外する
 * （要件: spec/00.requirements/mttr-tcr-measurement-requirements.ja.md §3.1）。
 */
function computeAverage(inputs: Inputs, range: DateRange): {
  value: number;
  sampleSize: number;
  samples: Array<{ date: string; value: number }>;
} {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const candidates = inputs.commits
    .map((c) => ({
      hash: c.hash,
      subject: c.subject,
      ms: new Date(c.committed_at).getTime(),
      committedAt: c.committed_at,
      codeFiles: filterCodeFiles(c.files),
    }))
    .filter((c) => !Number.isNaN(c.ms) && c.codeFiles.length > 0);

  const fixes = candidates.filter(
    (c) => isFailureCommit(c.subject) && c.ms >= fromMs && c.ms <= toMs,
  );

  const samples: Array<{ date: string; value: number }> = [];
  for (const fix of fixes) {
    let nearestMs: number | null = null;
    for (const c of candidates) {
      if (c.hash === fix.hash) continue;
      if (c.ms >= fix.ms || fix.ms - c.ms > FIX_WINDOW_MS) continue;
      if (!hasFileOverlap(fix.codeFiles, c.codeFiles)) continue;
      if (nearestMs === null || c.ms > nearestMs) nearestMs = c.ms;
    }
    if (nearestMs === null) continue;
    samples.push({ date: fix.committedAt, value: (fix.ms - nearestMs) / HOUR_MS });
  }

  const value =
    samples.length === 0 ? 0 : samples.reduce((acc, s) => acc + s.value, 0) / samples.length;
  return { value, sampleSize: samples.length, samples };
}

export function computeMeanTimeToRecovery(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const { value, sampleSize, samples } = computeAverage(inputs, range);
  const level = sampleSize > 0
    ? classifyDoraLevel('meanTimeToRecovery', value, thresholds)
    : undefined;

  const timeSeries = buildTimeSeries(samples, range, bucket, 'median');

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeAverage(previousInputs, previousRange);
    const deltaPct =
      prev.sampleSize === 0 || prev.value === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'meanTimeToRecovery',
    value,
    unit: 'hours',
    sampleSize,
    level,
    comparison,
    timeSeries,
  };
}
