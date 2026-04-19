import type { DateRange, MetricValue } from './types';
import { buildTimeSeries } from './timeSeriesUtils';

type Inputs = {
  messages: Array<{ uuid: string; created_at: string; role: string; type: string }>;
  messageCommits: Array<{ message_uuid: string }>;
};

function filterUserMessages(
  messages: Inputs['messages'],
  range: DateRange,
): Inputs['messages'] {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  return messages.filter((m) => {
    if (m.role !== 'user' || m.type === 'tool_use') return false;
    const t = new Date(m.created_at).getTime();
    return t >= fromMs && t <= toMs;
  });
}

function computeRate(inputs: Inputs, range: DateRange): { value: number; sampleSize: number; withCommits: Array<{ uuid: string; created_at: string }> } {
  const userMsgs = filterUserMessages(inputs.messages, range);
  const commitUuids = new Set(inputs.messageCommits.map((mc) => mc.message_uuid));
  const withCommits = userMsgs.filter((m) => commitUuids.has(m.uuid));
  const value = userMsgs.length === 0 ? 0 : (withCommits.length / userMsgs.length) * 100;
  return { value, sampleSize: userMsgs.length, withCommits };
}

export function computePromptToCommitSuccessRate(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
): MetricValue {
  const { value, sampleSize, withCommits } = computeRate(inputs, range);

  const timeSeries = buildTimeSeries(
    withCommits.map((m) => ({ date: m.created_at, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeRate(previousInputs, previousRange);
    const deltaPct =
      prev.sampleSize === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'promptToCommitSuccessRate',
    value,
    unit: 'percent',
    sampleSize,
    level: undefined,
    comparison,
    timeSeries,
  };
}
