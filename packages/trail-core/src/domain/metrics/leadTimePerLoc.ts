import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';

type Inputs = {
  messages: Array<{ uuid: string; created_at: string }>;
  messageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
  commits: Array<{ hash: string; lines_added?: number; lines_deleted?: number }>;
};

const VALID_CONFIDENCES = new Set(['realtime', 'high', 'medium']);

interface CommitSample {
  date: string;
  timeMin: number;
  churn: number;
}

function computeCommitSamples(inputs: Inputs, range: DateRange): CommitSample[] {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const msgMap = new Map(
    inputs.messages
      .filter((m) => {
        const t = new Date(m.created_at).getTime();
        return t >= fromMs && t <= toMs;
      })
      .map((m) => [m.uuid, m.created_at]),
  );

  const churnMap = new Map(
    inputs.commits.map((c) => [c.hash, (c.lines_added ?? 0) + (c.lines_deleted ?? 0)]),
  );

  type Aggregate = { earliestMsgAt: string; detectedAt: string };
  const byCommit = new Map<string, Aggregate>();

  for (const mc of inputs.messageCommits) {
    if (!VALID_CONFIDENCES.has(mc.match_confidence)) continue;
    const msgAt = msgMap.get(mc.message_uuid);
    if (!msgAt) continue;

    const existing = byCommit.get(mc.commit_hash);
    if (!existing) {
      byCommit.set(mc.commit_hash, { earliestMsgAt: msgAt, detectedAt: mc.detected_at });
    } else if (msgAt < existing.earliestMsgAt) {
      existing.earliestMsgAt = msgAt;
    }
  }

  const samples: CommitSample[] = [];
  for (const [hash, agg] of byCommit) {
    const churn = churnMap.get(hash) ?? 0;
    if (churn <= 0) continue;
    const diffMs = new Date(agg.detectedAt).getTime() - new Date(agg.earliestMsgAt).getTime();
    const timeMin = Math.max(0, diffMs / 60_000);
    samples.push({ date: agg.detectedAt, timeMin, churn });
  }
  return samples;
}

function buildSumRatioTimeSeries(
  samples: Array<{ date: string; numerator: number; denominator: number }>,
  range: DateRange,
  bucket: 'day' | 'week',
): Array<{ bucketStart: string; value: number }> {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const bucketFn = (ms: number) => {
    const d = new Date(ms);
    if (bucket === 'day') {
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const day = d.getUTCDay();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  };

  type Acc = { num: number; den: number };
  const buckets = new Map<number, Acc>();

  let cursor = bucketFn(fromMs);
  while (cursor <= toMs) {
    buckets.set(cursor, { num: 0, den: 0 });
    cursor += bucket === 'day' ? 86_400_000 : 7 * 86_400_000;
  }

  for (const s of samples) {
    const evMs = new Date(s.date).getTime();
    if (evMs < fromMs || evMs > toMs) continue;
    const key = bucketFn(evMs);
    const acc = buckets.get(key);
    if (acc) {
      acc.num += s.numerator;
      acc.den += s.denominator;
    } else {
      buckets.set(key, { num: s.numerator, den: s.denominator });
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ms, acc]) => ({
      bucketStart: new Date(ms).toISOString(),
      value: acc.den > 0 ? acc.num / acc.den : 0,
    }));
}

function aggregate(samples: CommitSample[]): number {
  if (samples.length === 0) return 0;
  const sumTime = samples.reduce((a, s) => a + s.timeMin, 0);
  const sumChurn = samples.reduce((a, s) => a + s.churn, 0);
  return sumChurn > 0 ? sumTime / sumChurn : 0;
}

export function computeLeadTimePerLoc(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const samples = computeCommitSamples(inputs, range);
  const value = aggregate(samples);

  const level = classifyDoraLevel('leadTimePerLoc', value, thresholds);

  const timeSeries = buildSumRatioTimeSeries(
    samples.map((s) => ({ date: s.date, numerator: s.timeMin, denominator: s.churn })),
    range,
    bucket,
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prevSamples = computeCommitSamples(previousInputs, previousRange);
    const previousValue = aggregate(prevSamples);
    const deltaPct =
      prevSamples.length === 0 || previousValue === 0
        ? null
        : ((value - previousValue) / previousValue) * 100;
    comparison = { previousValue, deltaPct };
  }

  return {
    id: 'leadTimePerLoc',
    value,
    unit: 'minPerLoc',
    sampleSize: samples.length,
    level,
    comparison,
    timeSeries,
  };
}
