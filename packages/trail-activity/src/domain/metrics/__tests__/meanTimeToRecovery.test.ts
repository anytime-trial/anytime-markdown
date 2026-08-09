import { computeMeanTimeToRecovery } from '../meanTimeToRecovery';
import type { DateRange } from '../types';

const RANGE: DateRange = {
  from: '2026-04-20T00:00:00.000Z',
  to: '2026-04-26T23:59:59.999Z',
};

const PREV_RANGE: DateRange = {
  from: '2026-04-13T00:00:00.000Z',
  to: '2026-04-19T23:59:59.999Z',
};

type Commit = { hash: string; subject: string; committed_at: string; files: string[] };

function commit(hash: string, subject: string, committedAt: string, files: string[]): Commit {
  return { hash, subject, committed_at: committedAt, files };
}

describe('computeMeanTimeToRecovery', () => {
  it('pairs a fix with the overlapping preceding commit and reports hours', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: add feature', '2026-04-21T08:00:00.000Z', ['src/foo.ts']),
          commit('b', 'fix: broken feature', '2026-04-21T12:00:00.000Z', ['src/foo.ts']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.value).toBe(4);
    expect(result.sampleSize).toBe(1);
    expect(result.unit).toBe('hours');
    expect(result.level).toBe('high'); // 1h <= 4h < 24h
  });

  it('uses the nearest preceding overlapping commit when multiple candidates exist', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: first touch', '2026-04-21T00:00:00.000Z', ['src/foo.ts']),
          commit('b', 'refactor: second touch', '2026-04-21T10:00:00.000Z', ['src/foo.ts']),
          commit('c', 'fix: repair', '2026-04-21T12:00:00.000Z', ['src/foo.ts']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.value).toBe(2); // c - b
    expect(result.sampleSize).toBe(1);
  });

  it('excludes unpairable fixes (no file overlap) from the sample', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: unrelated', '2026-04-21T08:00:00.000Z', ['src/other.ts']),
          commit('b', 'fix: something', '2026-04-21T12:00:00.000Z', ['src/foo.ts']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(0);
    expect(result.value).toBe(0);
    expect(result.level).toBeUndefined();
  });

  it('excludes preceding commits older than the 168h window', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: old touch', '2026-04-13T12:00:00.000Z', ['src/foo.ts']),
          commit('b', 'fix: late repair', '2026-04-21T12:00:00.000Z', ['src/foo.ts']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(0);
  });

  it('ignores overlap that consists only of non-code files', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'docs: update readme', '2026-04-21T08:00:00.000Z', ['README.md']),
          commit('b', 'fix: docs typo', '2026-04-21T12:00:00.000Z', ['README.md']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(0);
  });

  it('averages recovery time across multiple paired fixes', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: one', '2026-04-21T08:00:00.000Z', ['src/one.ts']),
          commit('b', 'fix: one', '2026-04-21T10:00:00.000Z', ['src/one.ts']), // 2h
          commit('c', 'feat: two', '2026-04-22T08:00:00.000Z', ['src/two.ts']),
          commit('d', 'fix: two', '2026-04-22T14:00:00.000Z', ['src/two.ts']), // 6h
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.value).toBe(4);
    expect(result.sampleSize).toBe(2);
  });

  it('only counts fixes committed within the range', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: base', '2026-04-18T08:00:00.000Z', ['src/foo.ts']),
          commit('b', 'fix: outside range', '2026-04-19T08:00:00.000Z', ['src/foo.ts']),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(0);
  });

  it('returns comparison against previous inputs when provided', () => {
    const result = computeMeanTimeToRecovery(
      {
        commits: [
          commit('a', 'feat: now', '2026-04-21T08:00:00.000Z', ['src/foo.ts']),
          commit('b', 'fix: now', '2026-04-21T12:00:00.000Z', ['src/foo.ts']), // 4h
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
      {
        commits: [
          commit('p1', 'feat: before', '2026-04-14T08:00:00.000Z', ['src/foo.ts']),
          commit('p2', 'fix: before', '2026-04-14T16:00:00.000Z', ['src/foo.ts']), // 8h
        ],
      },
    );
    expect(result.comparison?.previousValue).toBe(8);
    expect(result.comparison?.deltaPct).toBe(-50);
  });
});
