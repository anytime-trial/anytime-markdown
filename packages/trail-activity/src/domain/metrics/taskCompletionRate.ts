import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildTimeSeries } from './timeSeriesUtils';

/** `.tickets/` フロントマター由来の最小入力（供給側は trail-server）。 */
export type TicketInput = {
  assignee?: string;
  status: string;
  updated_at: string;
};

type Inputs = {
  tickets: TicketInput[];
};

/** 実行到達とみなすステータス（backlog / up_next は着手前のため母数外。2026-07-19: in_review 廃止に伴い除外）。 */
const ATTEMPTED_STATUSES = new Set(['in_progress', 'completed']);

/**
 * チケットベースの TCR。agent 担当かつ実行到達したチケットに対する completed の割合。
 * 状態遷移履歴を持たないため「範囲内に最終更新」で近似する
 * （要件: spec/00.requirements/mttr-tcr-measurement-requirements.ja.md §3.2）。
 */
function computeRate(inputs: Inputs, range: DateRange): {
  value: number;
  sampleSize: number;
  completions: Array<{ date: string }>;
} {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const attempted = inputs.tickets.filter((t) => {
    if (t.assignee !== 'agent') return false;
    if (!ATTEMPTED_STATUSES.has(t.status)) return false;
    const ms = new Date(t.updated_at).getTime();
    return !Number.isNaN(ms) && ms >= fromMs && ms <= toMs;
  });

  const completions = attempted
    .filter((t) => t.status === 'completed')
    .map((t) => ({ date: t.updated_at }));

  const value = attempted.length === 0 ? 0 : (completions.length / attempted.length) * 100;
  return { value, sampleSize: attempted.length, completions };
}

export function computeTaskCompletionRate(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const { value, sampleSize, completions } = computeRate(inputs, range);
  const level = sampleSize > 0
    ? classifyDoraLevel('taskCompletionRate', value, thresholds)
    : undefined;

  const timeSeries = buildTimeSeries(
    completions.map((c) => ({ date: c.date, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeRate(previousInputs, previousRange);
    const deltaPct =
      prev.sampleSize === 0 || prev.value === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'taskCompletionRate',
    value,
    unit: 'percent',
    sampleSize,
    level,
    comparison,
    timeSeries,
  };
}
