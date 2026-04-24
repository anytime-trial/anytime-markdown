import { computeLeadTimePerLoc } from '../../domain/metrics/leadTimePerLoc';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

function makeInputs(args: {
  pairs: Array<{ msgAt: string; commitHash: string; commitDetectedAt: string; confidence?: string }>;
  commits: Array<{ hash: string; lines_added: number; lines_deleted: number }>;
}) {
  return {
    messages: args.pairs.map((p, i) => ({ uuid: `m${i}`, created_at: p.msgAt })),
    messageCommits: args.pairs.map((p, i) => ({
      message_uuid: `m${i}`,
      detected_at: p.commitDetectedAt,
      commit_hash: p.commitHash,
      match_confidence: p.confidence ?? 'high',
    })),
    commits: args.commits,
  };
}

describe('computeLeadTimePerLoc', () => {
  it('empty inputs → value=0, sampleSize=0', () => {
    const result = computeLeadTimePerLoc(
      { messages: [], messageCommits: [], commits: [] },
      range,
      prevRange,
      'day',
    );
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.unit).toBe('minPerLoc');
  });

  it('single commit → time/churn ratio in min/LOC', () => {
    const inputs = makeInputs({
      pairs: [{ msgAt: '2026-04-10T00:00:00.000Z', commitHash: 'c1', commitDetectedAt: '2026-04-10T01:00:00.000Z' }],
      commits: [{ hash: 'c1', lines_added: 80, lines_deleted: 20 }],
    });
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0.6, 2);
    expect(result.sampleSize).toBe(1);
  });

  it('multiple commits → sum-based ratio (Σtime/Σchurn)', () => {
    const inputs = makeInputs({
      pairs: [
        { msgAt: '2026-04-10T00:00:00.000Z', commitHash: 'c1', commitDetectedAt: '2026-04-10T01:00:00.000Z' },
        { msgAt: '2026-04-11T00:00:00.000Z', commitHash: 'c2', commitDetectedAt: '2026-04-11T02:00:00.000Z' },
      ],
      commits: [
        { hash: 'c1', lines_added: 60, lines_deleted: 40 },
        { hash: 'c2', lines_added: 50, lines_deleted: 50 },
      ],
    });
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0.9, 2);
    expect(result.sampleSize).toBe(2);
  });

  it('multiple prompts per commit → uses earliest prompt timestamp', () => {
    const inputs = {
      messages: [
        { uuid: 'm0', created_at: '2026-04-10T10:00:00.000Z' },
        { uuid: 'm1', created_at: '2026-04-10T10:15:00.000Z' },
        { uuid: 'm2', created_at: '2026-04-10T10:25:00.000Z' },
      ],
      messageCommits: [
        { message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T10:30:00.000Z', match_confidence: 'high' },
        { message_uuid: 'm1', commit_hash: 'c1', detected_at: '2026-04-10T10:30:00.000Z', match_confidence: 'high' },
        { message_uuid: 'm2', commit_hash: 'c1', detected_at: '2026-04-10T10:30:00.000Z', match_confidence: 'high' },
      ],
      commits: [{ hash: 'c1', lines_added: 60, lines_deleted: 40 }],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0.3, 2);
    expect(result.sampleSize).toBe(1);
  });

  it('excludes match_confidence=low', () => {
    const inputs = makeInputs({
      pairs: [
        { msgAt: '2026-04-10T00:00:00.000Z', commitHash: 'c1', commitDetectedAt: '2026-04-10T01:00:00.000Z', confidence: 'low' },
        { msgAt: '2026-04-11T00:00:00.000Z', commitHash: 'c2', commitDetectedAt: '2026-04-11T02:00:00.000Z', confidence: 'high' },
      ],
      commits: [
        { hash: 'c1', lines_added: 100, lines_deleted: 0 },
        { hash: 'c2', lines_added: 100, lines_deleted: 0 },
      ],
    });
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(1.2, 2);
  });

  it('excludes commits with churn=0', () => {
    const inputs = makeInputs({
      pairs: [
        { msgAt: '2026-04-10T00:00:00.000Z', commitHash: 'c1', commitDetectedAt: '2026-04-10T01:00:00.000Z' },
        { msgAt: '2026-04-11T00:00:00.000Z', commitHash: 'c2', commitDetectedAt: '2026-04-11T02:00:00.000Z' },
      ],
      commits: [
        { hash: 'c1', lines_added: 0, lines_deleted: 0 },
        { hash: 'c2', lines_added: 100, lines_deleted: 0 },
      ],
    });
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(1.2, 2);
  });

  it('deltaPct calculated from previous period', () => {
    const current = makeInputs({
      pairs: [{ msgAt: '2026-04-10T00:00:00.000Z', commitHash: 'c1', commitDetectedAt: '2026-04-10T01:00:00.000Z' }],
      commits: [{ hash: 'c1', lines_added: 100, lines_deleted: 0 }],
    });
    const prev = makeInputs({
      pairs: [{ msgAt: '2026-03-10T00:00:00.000Z', commitHash: 'c0', commitDetectedAt: '2026-03-10T02:00:00.000Z' }],
      commits: [{ hash: 'c0', lines_added: 100, lines_deleted: 0 }],
    });
    const result = computeLeadTimePerLoc(current, range, prevRange, 'day', prev);
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.previousValue).toBeCloseTo(1.2, 2);
    expect(result.comparison!.deltaPct).toBeCloseTo(-50, 1);
  });
});
