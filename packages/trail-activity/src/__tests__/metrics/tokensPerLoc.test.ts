import { computeTokensPerLoc } from '../../domain/metrics/tokensPerLoc';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

const SESSION = 'sess-1';

function userMsg(uuid: string, ts: string, tokens: { in?: number; out?: number; cr?: number; cc?: number } = {}, sessionId: string = SESSION) {
  return {
    uuid,
    created_at: ts,
    type: 'user',
    session_id: sessionId,
    input_tokens: tokens.in ?? 0,
    output_tokens: tokens.out ?? 0,
    cache_read_tokens: tokens.cr ?? 0,
    cache_creation_tokens: tokens.cc ?? 0,
  };
}

function commit(hash: string, ts: string, churn: number, sessionId: string = SESSION) {
  const half = Math.floor(churn / 2);
  return {
    hash,
    committed_at: ts,
    session_id: sessionId,
    lines_added: half,
    lines_deleted: churn - half,
  };
}

describe('computeTokensPerLoc', () => {
  it('empty inputs → value=0, sampleSize=0', () => {
    const result = computeTokensPerLoc(
      { messages: [], commits: [] },
      range,
      prevRange,
      'day',
    );
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.unit).toBe('tokensPerLoc');
  });

  it('single commit → sum of 4 token types / churn', () => {
    const inputs = {
      messages: [userMsg('m0', '2026-04-10T00:00:00.000Z', { in: 100, out: 200, cr: 300, cc: 400 })],
      commits: [commit('c1', '2026-04-10T01:00:00.000Z', 100)],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(10, 1); // 1000 / 100
    expect(result.sampleSize).toBe(1);
  });

  it('multiple prompts in window → tokens summed', () => {
    const inputs = {
      messages: [
        userMsg('m0', '2026-04-10T10:00:00.000Z', { in: 200 }),
        userMsg('m1', '2026-04-10T10:15:00.000Z', { in: 200 }),
      ],
      commits: [commit('c1', '2026-04-10T10:30:00.000Z', 100)],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(4, 1); // 400 / 100
    expect(result.sampleSize).toBe(1);
  });

  it('previous-commit anchors next window', () => {
    // u0=10:00 (1000 tok), u1=10:30 (2000 tok) attributed to c1@11:00 → 3000/100
    // u2=11:30 (500 tok) attributed to c2@12:00 → 500/100
    // total: 3500 / 200 = 17.5
    const inputs = {
      messages: [
        userMsg('m0', '2026-04-10T10:00:00.000Z', { in: 1000 }),
        userMsg('m1', '2026-04-10T10:30:00.000Z', { in: 2000 }),
        userMsg('m2', '2026-04-10T11:30:00.000Z', { in: 500 }),
      ],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100),
        commit('c2', '2026-04-10T12:00:00.000Z', 100),
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(17.5, 2);
    expect(result.sampleSize).toBe(2);
  });

  it('different sessions are scoped independently', () => {
    const inputs = {
      messages: [
        userMsg('mA', '2026-04-10T10:00:00.000Z', { in: 1000 }, 'sess-A'),
        userMsg('mB', '2026-04-10T14:00:00.000Z', { in: 2000 }, 'sess-B'),
      ],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100, 'sess-A'),
        commit('c2', '2026-04-10T15:00:00.000Z', 100, 'sess-B'),
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBeCloseTo(15, 1); // (1000 + 2000) / 200
  });

  it('excludes commits with churn=0', () => {
    const inputs = {
      messages: [
        userMsg('m0', '2026-04-10T00:00:00.000Z', { in: 1000 }),
        userMsg('m1', '2026-04-11T00:00:00.000Z', { in: 1000 }),
      ],
      commits: [
        commit('c1', '2026-04-10T01:00:00.000Z', 0),
        commit('c2', '2026-04-11T02:00:00.000Z', 100),
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(10, 1);
  });

  it('no prompts in window → commit excluded', () => {
    const inputs = {
      messages: [userMsg('m0', '2026-04-10T10:00:00.000Z', { in: 1000 })],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100),
        commit('c2', '2026-04-10T12:00:00.000Z', 100), // no prompts after c1
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(10, 1);
  });

  it('deltaPct calculated from previous period', () => {
    const current = {
      messages: [userMsg('m0', '2026-04-10T00:00:00.000Z', { in: 1000 })],
      commits: [commit('c1', '2026-04-10T01:00:00.000Z', 100)],
    };
    const prev = {
      messages: [userMsg('m0', '2026-03-10T00:00:00.000Z', { in: 2000 })],
      commits: [commit('c0', '2026-03-10T01:00:00.000Z', 100)],
    };
    const result = computeTokensPerLoc(current, range, prevRange, 'day', prev);
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.previousValue).toBeCloseTo(20, 1);
    expect(result.comparison!.deltaPct).toBeCloseTo(-50, 1);
  });
});
