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

export { FIX_WINDOW_MS as AI_FIRST_TRY_FIX_WINDOW_MS } from './failureCommit';
export { isCodeFile } from './failureCommit';

export function isAiFirstTryFailureCommit(subject: string): boolean {
  return isFailureCommit(subject);
}

type Commit = {
  hash: string;
  subject: string;
  committed_at: string;
  is_ai_assisted: boolean;
  files: string[];
};

type Inputs = {
  commits: Commit[];
};

function computeRate(inputs: Inputs, range: DateRange): {
  value: number;
  sampleSize: number;
  successes: Array<{ date: string }>;
} {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  // 分母には fix/revert/hotfix も含める。要件定義「修正なしでマージされた AI 生成コードの割合」
  // において fix コミット自体も AI 生成コードの 1 つであり、自身の後続に更なる修正が
  // 入っていなければ「修正なしで済んだ」として成功扱いになる。
  const aiCommitsInRange = inputs.commits
    .filter((c) => {
      if (!c.is_ai_assisted) return false;
      const t = new Date(c.committed_at).getTime();
      if (t < fromMs || t > toMs) return false;
      // files が空 (未バックフィル) は楽観的に残す。files が非空でコードを 1 件も含まなければ除外。
      if (c.files.length > 0 && filterCodeFiles(c.files).length === 0) return false;
      return true;
    })
    .map((c) => ({ commit: c, codeFiles: filterCodeFiles(c.files) }));

  const fixes = inputs.commits
    .filter((c) => isFailureCommit(c.subject))
    .map((c) => ({
      ms: new Date(c.committed_at).getTime(),
      codeFiles: filterCodeFiles(c.files),
    }))
    .filter((f) => !Number.isNaN(f.ms));

  const successes: Array<{ date: string }> = [];
  for (const { commit, codeFiles } of aiCommitsInRange) {
    const commitMs = new Date(commit.committed_at).getTime();
    if (Number.isNaN(commitMs)) continue;
    const failed = fixes.some(
      (f) => f.ms > commitMs
        && f.ms - commitMs <= FIX_WINDOW_MS
        && hasFileOverlap(codeFiles, f.codeFiles),
    );
    if (!failed) {
      successes.push({ date: commit.committed_at });
    }
  }

  const value = aiCommitsInRange.length === 0
    ? 0
    : (successes.length / aiCommitsInRange.length) * 100;
  return { value, sampleSize: aiCommitsInRange.length, successes };
}

export function computeAiFirstTrySuccessRate(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const { value, sampleSize, successes } = computeRate(inputs, range);
  const level = sampleSize > 0
    ? classifyDoraLevel('aiFirstTrySuccessRate', value, thresholds)
    : undefined;

  const timeSeries = buildTimeSeries(
    successes.map((s) => ({ date: s.date, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeRate(previousInputs, previousRange);
    const deltaPct = prev.sampleSize === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'aiFirstTrySuccessRate',
    value,
    unit: 'percent',
    sampleSize,
    level,
    comparison,
    timeSeries,
  };
}
