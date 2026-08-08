import { computeLeadTimePerLoc } from '../../domain/metrics/leadTimePerLoc';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

const SESSION = 'sess-1';

function userMsg(uuid: string, ts: string, sessionId: string = SESSION) {
  return { uuid, created_at: ts, type: 'user', session_id: sessionId };
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

describe('computeLeadTimePerLoc', () => {
  it('empty inputs → value=0, sampleSize=0', () => {
    const result = computeLeadTimePerLoc(
      { messages: [], commits: [] },
      range,
      prevRange,
      'day',
    );
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.unit).toBe('minPerLoc');
  });

  it('single commit with one preceding prompt → time/churn ratio', () => {
    const inputs = {
      messages: [userMsg('m0', '2026-04-10T00:00:00.000Z')],
      commits: [commit('c1', '2026-04-10T01:00:00.000Z', 100)],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0.6, 2);
    expect(result.sampleSize).toBe(1);
  });

  it('multiple commits in same session → previous-commit anchors next window', () => {
    // u0=10:00, u1=10:30, u2=11:30
    // c1 at 11:00 → window (null, 11:00] picks u0 → time = 60min, churn = 100
    // c2 at 12:00 → window (11:00, 12:00] picks u2 → time = 30min, churn = 100
    // total: (60+30) / (100+100) = 0.45 min/LOC
    const inputs = {
      messages: [
        userMsg('m0', '2026-04-10T10:00:00.000Z'),
        userMsg('m1', '2026-04-10T10:30:00.000Z'),
        userMsg('m2', '2026-04-10T11:30:00.000Z'),
      ],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100),
        commit('c2', '2026-04-10T12:00:00.000Z', 100),
      ],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(0.45, 2);
    expect(result.sampleSize).toBe(2);
  });

  it('no eligible prompts in window → commit excluded', () => {
    // u0=10:00 belongs to c1's window
    // c2 has no prompts in (c1, c2] → excluded
    const inputs = {
      messages: [userMsg('m0', '2026-04-10T10:00:00.000Z')],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100),
        commit('c2', '2026-04-10T12:00:00.000Z', 100),
      ],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1); // only c1
    expect(result.value).toBeCloseTo(0.6, 2);
  });

  it('different sessions are scoped independently', () => {
    // session A: u0=10:00, c1=11:00 → 60min/100 LOC
    // session B: u1=14:00 (different session), c2=15:00 → 60min/100 LOC
    // c2 in session B does NOT see session A's u0
    const inputs = {
      messages: [
        userMsg('mA', '2026-04-10T10:00:00.000Z', 'sess-A'),
        userMsg('mB', '2026-04-10T14:00:00.000Z', 'sess-B'),
      ],
      commits: [
        commit('c1', '2026-04-10T11:00:00.000Z', 100, 'sess-A'),
        commit('c2', '2026-04-10T15:00:00.000Z', 100, 'sess-B'),
      ],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBeCloseTo(0.6, 2); // (60+60) / (100+100)
  });

  it('excludes commits with churn=0', () => {
    const inputs = {
      messages: [
        userMsg('m0', '2026-04-10T00:00:00.000Z'),
        userMsg('m1', '2026-04-11T00:00:00.000Z'),
      ],
      commits: [
        commit('c1', '2026-04-10T01:00:00.000Z', 0),
        commit('c2', '2026-04-11T02:00:00.000Z', 100),
      ],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(1.2, 2); // c2: 120min/100 LOC
  });

  it('ignores commits outside range but uses them as previous-anchor', () => {
    // c0 at 03-31 (out of range) acts as previous anchor for c1 in range
    const inputs = {
      messages: [
        userMsg('m_pre', '2026-03-30T00:00:00.000Z'),
        userMsg('m1', '2026-04-10T10:00:00.000Z'),
      ],
      commits: [
        commit('c0', '2026-03-31T00:00:00.000Z', 100),
        commit('c1', '2026-04-10T11:00:00.000Z', 100),
      ],
    };
    const result = computeLeadTimePerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1); // c0 outside range, c1 attributed
    expect(result.value).toBeCloseTo(0.6, 2); // c1: 60min / 100 LOC
  });

  it('deltaPct calculated from previous period', () => {
    const current = {
      messages: [userMsg('m0', '2026-04-10T00:00:00.000Z')],
      commits: [commit('c1', '2026-04-10T01:00:00.000Z', 100)],
    };
    const prev = {
      messages: [userMsg('m0', '2026-03-10T00:00:00.000Z')],
      commits: [commit('c0', '2026-03-10T02:00:00.000Z', 100)],
    };
    const result = computeLeadTimePerLoc(current, range, prevRange, 'day', prev);
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.previousValue).toBeCloseTo(1.2, 2);
    expect(result.comparison!.deltaPct).toBeCloseTo(-50, 1);
  });
});
