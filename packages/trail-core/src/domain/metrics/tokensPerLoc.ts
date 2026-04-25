import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildRatioTimeSeries } from './timeSeriesUtils';

type Inputs = {
  messages: Array<{
    uuid: string;
    created_at: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }>;
  messageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
  commits: Array<{ hash: string; lines_added?: number; lines_deleted?: number }>;
};

const VALID_CONFIDENCES = new Set(['realtime', 'high', 'medium']);

interface CommitSample {
  date: string;
  tokens: number;
  churn: number;
}

function totalTokens(m: Inputs['messages'][number]): number {
  return (m.input_tokens ?? 0) + (m.output_tokens ?? 0) + (m.cache_read_tokens ?? 0) + (m.cache_creation_tokens ?? 0);
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
      .map((m) => [m.uuid, m] as const),
  );

  const churnMap = new Map(
    inputs.commits.map((c) => [c.hash, (c.lines_added ?? 0) + (c.lines_deleted ?? 0)]),
  );

  type Aggregate = { detectedAt: string; tokens: number };
  const byCommit = new Map<string, Aggregate>();

  for (const mc of inputs.messageCommits) {
    if (!VALID_CONFIDENCES.has(mc.match_confidence)) continue;
    const msg = msgMap.get(mc.message_uuid);
    if (!msg) continue;

    const tokens = totalTokens(msg);
    const existing = byCommit.get(mc.commit_hash);
    if (!existing) {
      byCommit.set(mc.commit_hash, { detectedAt: mc.detected_at, tokens });
    } else {
      existing.tokens += tokens;
    }
  }

  const samples: CommitSample[] = [];
  for (const [hash, agg] of byCommit) {
    const churn = churnMap.get(hash) ?? 0;
    if (churn <= 0) continue;
    samples.push({ date: agg.detectedAt, tokens: agg.tokens, churn });
  }
  return samples;
}

function aggregate(samples: CommitSample[]): number {
  if (samples.length === 0) return 0;
  const sumTokens = samples.reduce((a, s) => a + s.tokens, 0);
  const sumChurn = samples.reduce((a, s) => a + s.churn, 0);
  return sumChurn > 0 ? sumTokens / sumChurn : 0;
}

export function computeTokensPerLoc(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const samples = computeCommitSamples(inputs, range);
  const value = aggregate(samples);

  const level = classifyDoraLevel('tokensPerLoc', value, thresholds);

  const timeSeries = buildRatioTimeSeries(
    samples.map((s) => ({ date: s.date, numerator: s.tokens, denominator: s.churn })),
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
    id: 'tokensPerLoc',
    value,
    unit: 'tokensPerLoc',
    sampleSize: samples.length,
    level,
    comparison,
    timeSeries,
  };
}
