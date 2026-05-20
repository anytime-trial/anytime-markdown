import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildRatioTimeSeries } from './timeSeriesUtils';

type Inputs = {
  messages: Array<{
    uuid: string;
    created_at: string;
    session_id?: string;
    type?: string;
    role?: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
    cost_usd?: number;
  }>;
  commits: Array<{ hash: string; committed_at: string; session_id?: string; lines_added?: number; lines_deleted?: number }>;
};

interface CommitSample {
  date: string;
  tokens: number;
  cost: number;
  churn: number;
}

function isUserMessage(m: Inputs['messages'][number]): boolean {
  return m.role === 'user' || m.type === 'user';
}

function totalTokens(m: Inputs['messages'][number]): number {
  return (m.input_tokens ?? 0) + (m.output_tokens ?? 0) + (m.cache_read_tokens ?? 0) + (m.cache_creation_tokens ?? 0);
}

type UserEntry = { ts: string; tokens: number; cost: number };
type SessionCommit = { hash: string; committedAt: string; churn: number };

function buildUserMsgsBySession(messages: Inputs['messages']): Map<string, UserEntry[]> {
  const map = new Map<string, UserEntry[]>();
  for (const m of messages) {
    if (!m.session_id || !isUserMessage(m)) continue;
    const entry: UserEntry = { ts: m.created_at, tokens: totalTokens(m), cost: m.cost_usd ?? 0 };
    const arr = map.get(m.session_id);
    if (arr) arr.push(entry);
    else map.set(m.session_id, [entry]);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.ts.localeCompare(b.ts));
  return map;
}

function buildCommitsBySession(commits: Inputs['commits']): Map<string, SessionCommit[]> {
  const map = new Map<string, SessionCommit[]>();
  for (const c of commits) {
    if (!c.session_id) continue;
    const churn = (c.lines_added ?? 0) + (c.lines_deleted ?? 0);
    const entry: SessionCommit = { hash: c.hash, committedAt: c.committed_at, churn };
    const arr = map.get(c.session_id);
    if (arr) arr.push(entry);
    else map.set(c.session_id, [entry]);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.committedAt.localeCompare(b.committedAt));
  return map;
}

/** Sum tokens/cost of user messages attributed to a commit window, advancing userIdx in place. */
function attributeMessagesToCommit(
  userMsgs: readonly UserEntry[],
  userIdxRef: { v: number },
  prevCommitTs: string | null,
  commitTs: string,
): { tokens: number; cost: number; attributed: number } {
  let tokens = 0;
  let cost = 0;
  let attributed = 0;
  for (; userIdxRef.v < userMsgs.length; userIdxRef.v++) {
    const u = userMsgs[userIdxRef.v];
    if (prevCommitTs !== null && u.ts <= prevCommitTs) continue;
    if (u.ts > commitTs) break;
    tokens += u.tokens;
    cost += u.cost;
    attributed += 1;
  }
  return { tokens, cost, attributed };
}

function updateBestByCommit(
  bestByCommit: Map<string, CommitSample>,
  hash: string,
  sample: CommitSample,
): void {
  const existing = bestByCommit.get(hash);
  // Keep the smallest tokens-per-LOC ratio (most accurate attribution).
  if (!existing || sample.tokens / sample.churn < existing.tokens / existing.churn) {
    bestByCommit.set(hash, sample);
  }
}

function processSessionCommits(
  commits: readonly SessionCommit[],
  userMsgs: readonly UserEntry[],
  fromMs: number,
  toMs: number,
  bestByCommit: Map<string, CommitSample>,
): void {
  let prevCommitTs: string | null = null;
  const userIdxRef = { v: 0 };

  for (const c of commits) {
    const commitMs = new Date(c.committedAt).getTime();
    const outOfRange = commitMs < fromMs || commitMs > toMs;

    if (c.churn <= 0 || outOfRange) {
      prevCommitTs = c.committedAt;
      continue;
    }

    const { tokens, cost, attributed } = attributeMessagesToCommit(
      userMsgs, userIdxRef, prevCommitTs, c.committedAt,
    );

    if (attributed > 0) {
      updateBestByCommit(bestByCommit, c.hash, {
        date: c.committedAt, tokens, cost, churn: c.churn,
      });
    }

    prevCommitTs = c.committedAt;
  }
}

function computeCommitSamples(inputs: Inputs, range: DateRange): CommitSample[] {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const userMsgsBySession = buildUserMsgsBySession(inputs.messages);
  const commitsBySession = buildCommitsBySession(inputs.commits);

  const bestByCommit = new Map<string, CommitSample>();

  for (const [sessionId, commits] of commitsBySession) {
    const userMsgs = userMsgsBySession.get(sessionId) ?? [];
    processSessionCommits(commits, userMsgs, fromMs, toMs, bestByCommit);
  }

  return Array.from(bestByCommit.values());
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

export function computeTokensAndCostPerLocTimeSeries(
  inputs: Inputs,
  range: DateRange,
  bucket: 'day' | 'week',
): {
  tokens: Array<{ bucketStart: string; value: number }>;
  cost: Array<{ bucketStart: string; value: number }>;
} {
  const samples = computeCommitSamples(inputs, range);
  const tokens = buildRatioTimeSeries(
    samples.map((s) => ({ date: s.date, numerator: s.tokens, denominator: s.churn })),
    range,
    bucket,
  );
  const cost = buildRatioTimeSeries(
    samples.map((s) => ({ date: s.date, numerator: s.cost, denominator: s.churn })),
    range,
    bucket,
  );
  return { tokens, cost };
}
