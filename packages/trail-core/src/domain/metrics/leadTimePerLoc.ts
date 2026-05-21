import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import { extractCommitPrefix } from '../model/commitPrefix';
import type { DateRange, MetricValue } from './types';
import { buildRatioTimeSeries, buildTimeSeries } from './timeSeriesUtils';

type Inputs = {
  messages: Array<{ uuid: string; created_at: string; session_id?: string; type?: string; role?: string }>;
  commits: Array<{ hash: string; subject?: string; committed_at: string; session_id?: string; lines_added?: number; lines_deleted?: number }>;
};

interface CommitSample {
  date: string;
  timeMin: number;
  churn: number;
  prefix: string;
}

interface CommitSamplesResult {
  samples: CommitSample[];
  unmappedDates: string[];
}

function isUserMessage(m: Inputs['messages'][number]): boolean {
  return m.role === 'user' || m.type === 'user';
}

/** セッション別ユーザーメッセージを昇順ソートしてMapに整理する */
function groupUserMsgsBySession(messages: Inputs['messages']): Map<string, Array<{ ts: string }>> {
  const bySession = new Map<string, Array<{ ts: string }>>();
  for (const m of messages) {
    if (!m.session_id || !isUserMessage(m)) continue;
    const entry = { ts: m.created_at };
    const arr = bySession.get(m.session_id);
    if (arr) arr.push(entry);
    else bySession.set(m.session_id, [entry]);
  }
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.ts.localeCompare(b.ts));
  }
  return bySession;
}

type SessionCommit = { hash: string; committedAt: string; churn: number; prefix: string };

/** セッション別コミットを昇順ソートしてMapに整理する */
function groupCommitsBySession(commits: Inputs['commits']): Map<string, SessionCommit[]> {
  const bySession = new Map<string, SessionCommit[]>();
  for (const c of commits) {
    if (!c.session_id) continue;
    const churn = (c.lines_added ?? 0) + (c.lines_deleted ?? 0);
    const prefix = c.subject ? extractCommitPrefix(c.subject) : 'other';
    const entry: SessionCommit = { hash: c.hash, committedAt: c.committed_at, churn, prefix };
    const arr = bySession.get(c.session_id);
    if (arr) arr.push(entry);
    else bySession.set(c.session_id, [entry]);
  }
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.committedAt.localeCompare(b.committedAt));
  }
  return bySession;
}

/** prevCommitTs より後かつ committedAt 以前の最初のユーザーメッセージを探す */
function findEarliestUserMsg(
  userMsgs: Array<{ ts: string }>,
  prevCommitTs: string | null,
  committedAt: string,
): string | null {
  for (const u of userMsgs) {
    if (prevCommitTs !== null && u.ts <= prevCommitTs) continue;
    if (u.ts > committedAt) break;
    return u.ts;
  }
  return null;
}

/** コミットのリードタイムサンプルを bestByCommit に登録（小さい方を採用） */
function recordBestSample(
  c: SessionCommit,
  earliest: string,
  bestByCommit: Map<string, CommitSample>,
): void {
  const diffMs = new Date(c.committedAt).getTime() - new Date(earliest).getTime();
  const timeMin = Math.max(0, diffMs / 60_000);
  const sample: CommitSample = { date: c.committedAt, timeMin, churn: c.churn, prefix: c.prefix };
  const existing = bestByCommit.get(c.hash);
  if (!existing || timeMin < existing.timeMin) {
    bestByCommit.set(c.hash, sample);
  }
}

/** セッション内のコミット列を走査してリードタイムを bestByCommit に蓄積する */
function processSessionCommits(
  commits: SessionCommit[],
  userMsgs: Array<{ ts: string }>,
  fromMs: number,
  toMs: number,
  bestByCommit: Map<string, CommitSample>,
): void {
  let prevCommitTs: string | null = null;
  for (const c of commits) {
    const commitMs = new Date(c.committedAt).getTime();
    const outOfRange = commitMs < fromMs || commitMs > toMs;
    if (c.churn <= 0 || outOfRange) {
      prevCommitTs = c.committedAt;
      continue;
    }
    const earliest = findEarliestUserMsg(userMsgs, prevCommitTs, c.committedAt);
    if (earliest !== null) {
      recordBestSample(c, earliest, bestByCommit);
    }
    prevCommitTs = c.committedAt;
  }
}

/** 範囲内・churn>0 の全コミットのうち bestByCommit にないものの committed_at を返す */
function collectUnmappedDates(
  allCommits: Inputs['commits'],
  fromMs: number,
  toMs: number,
  bestByCommit: Map<string, CommitSample>,
): string[] {
  const unmapped: string[] = [];
  for (const c of allCommits) {
    const churn = (c.lines_added ?? 0) + (c.lines_deleted ?? 0);
    if (churn <= 0) continue;
    const ms = new Date(c.committed_at).getTime();
    if (ms < fromMs || ms > toMs) continue;
    if (!bestByCommit.has(c.hash)) unmapped.push(c.committed_at);
  }
  return unmapped;
}

function computeCommitSamples(inputs: Inputs, range: DateRange): CommitSamplesResult {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  const userMsgsBySession = groupUserMsgsBySession(inputs.messages);
  const commitsBySession = groupCommitsBySession(inputs.commits);

  const bestByCommit = new Map<string, CommitSample>();
  for (const [sessionId, commits] of commitsBySession) {
    const userMsgs = userMsgsBySession.get(sessionId) ?? [];
    processSessionCommits(commits, userMsgs, fromMs, toMs, bestByCommit);
  }

  const unmappedDates = collectUnmappedDates(inputs.commits, fromMs, toMs, bestByCommit);

  return { samples: Array.from(bestByCommit.values()), unmappedDates };
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
  const { samples } = computeCommitSamples(inputs, range);
  const value = aggregate(samples);

  const level = classifyDoraLevel('leadTimePerLoc', value, thresholds);

  const timeSeries = buildRatioTimeSeries(
    samples.map((s) => ({ date: s.date, numerator: s.timeMin, denominator: s.churn })),
    range,
    bucket,
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const { samples: prevSamples } = computeCommitSamples(previousInputs, previousRange);
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

export function computeLeadTimeMinTimeSeries(
  inputs: Inputs,
  range: DateRange,
  bucket: 'day' | 'week',
): Array<{ bucketStart: string; value: number }> {
  const { samples } = computeCommitSamples(inputs, range);
  return buildTimeSeries(
    samples.map((s) => ({ date: s.date, value: s.timeMin })),
    range,
    bucket,
    'sum',
  );
}

export function computeLeadTimeUnmappedTimeSeries(
  inputs: Inputs,
  range: DateRange,
  bucket: 'day' | 'week',
): Array<{ bucketStart: string; value: number }> {
  const { unmappedDates } = computeCommitSamples(inputs, range);
  return buildTimeSeries(
    unmappedDates.map((d) => ({ date: d, value: 1 })),
    range,
    bucket,
    'sum',
  );
}

export function computeLeadTimeMinByPrefixTimeSeries(
  inputs: Inputs,
  range: DateRange,
  bucket: 'day' | 'week',
): { prefixes: string[]; series: Array<{ bucketStart: string; byPrefix: Record<string, number> }> } {
  const { samples } = computeCommitSamples(inputs, range);
  const prefixSet = new Set<string>();
  for (const s of samples) prefixSet.add(s.prefix);
  const prefixes = [...prefixSet].sort((a, b) => a.localeCompare(b));

  const seriesByPrefix = new Map<string, Array<{ bucketStart: string; value: number }>>();
  for (const p of prefixes) {
    const seriesForPrefix = buildTimeSeries(
      samples.filter((s) => s.prefix === p).map((s) => ({ date: s.date, value: s.timeMin })),
      range,
      bucket,
      'sum',
    );
    seriesByPrefix.set(p, seriesForPrefix);
  }

  const bucketStarts = (seriesByPrefix.get(prefixes[0]) ?? []).map((b) => b.bucketStart);
  const series = bucketStarts.map((bucketStart, i) => {
    const byPrefix: Record<string, number> = {};
    for (const p of prefixes) {
      byPrefix[p] = seriesByPrefix.get(p)?.[i]?.value ?? 0;
    }
    return { bucketStart, byPrefix };
  });

  return { prefixes, series };
}
