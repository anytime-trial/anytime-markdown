import { buildCumulativeCommitDataset } from '../CommitsCombinedChart';

const baseArgs = {
  commitPeriods: ['2026-05-10', '2026-05-11', '2026-05-12'] as readonly string[],
  commitLabels: ['05-10', '05-11', '05-12'] as readonly string[],
  categoryKeys: [0, 1, 2] as readonly number[],
  getCategory: (prefix: string) => {
    if (prefix === 'feat') return 0;
    if (prefix === 'fix') return 1;
    return 2;
  },
};

describe('buildCumulativeCommitDataset', () => {
  it('starts at baseline per category and accumulates per period', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitRows: [
        { period: '2026-05-10', prefix: 'feat', count: 2 },
        { period: '2026-05-10', prefix: 'fix', count: 1 },
        { period: '2026-05-11', prefix: 'feat', count: 3 },
        { period: '2026-05-12', prefix: 'refactor', count: 1 },
      ],
      baselinePerCategory: new Map([[0, 10], [1, 5], [2, 0]]),
      baselineRegression: 0,
      baselineTotal: 15,
      regressionByPeriod: [],
    });
    expect(dataset).toEqual([
      { period: '05-10', c0: 12, c1: 6, c2: 0, regressionRate: 0 },
      { period: '05-11', c0: 15, c1: 6, c2: 0, regressionRate: 0 },
      { period: '05-12', c0: 15, c1: 6, c2: 1, regressionRate: 0 },
    ]);
  });

  it('computes cumulative regression rate including baseline', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitRows: [
        { period: '2026-05-10', prefix: 'fix', count: 4 },
        { period: '2026-05-11', prefix: 'fix', count: 4 },
        { period: '2026-05-12', prefix: 'fix', count: 2 },
      ],
      baselinePerCategory: new Map([[0, 0], [1, 100], [2, 0]]),
      baselineRegression: 10,
      baselineTotal: 100,
      regressionByPeriod: [
        { period: '2026-05-10', count: 2 },
        { period: '2026-05-12', count: 1 },
      ],
    });
    // Period 1: regression=10+2=12, total=100+4=104 -> 12/104 = 11.538%
    // Period 2: regression=12+0=12, total=104+4=108 -> 12/108 = 11.111%
    // Period 3: regression=12+1=13, total=108+2=110 -> 13/110 = 11.818%
    expect(dataset[0]!.regressionRate as number).toBeCloseTo(11.538, 2);
    expect(dataset[1]!.regressionRate as number).toBeCloseTo(11.111, 2);
    expect(dataset[2]!.regressionRate as number).toBeCloseTo(11.818, 2);
  });

  it('returns null regression rate when total is zero', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: ['2026-05-10'],
      commitLabels: ['05-10'],
      commitRows: [],
      baselinePerCategory: new Map([[0, 0], [1, 0], [2, 0]]),
      baselineRegression: 0,
      baselineTotal: 0,
      regressionByPeriod: [],
    });
    expect(dataset[0]!.regressionRate).toBeNull();
  });

  it('handles empty commitRows by emitting baseline-only values', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: ['2026-05-10'],
      commitLabels: ['05-10'],
      commitRows: [],
      baselinePerCategory: new Map([[0, 7], [1, 3], [2, 1]]),
      baselineRegression: 1,
      baselineTotal: 11,
      regressionByPeriod: [],
    });
    expect(dataset[0]).toEqual({
      period: '05-10',
      c0: 7,
      c1: 3,
      c2: 1,
      regressionRate: (1 / 11) * 100,
    });
  });

  it('only accumulates - never decreases per category', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitRows: [
        { period: '2026-05-10', prefix: 'feat', count: 5 },
        // period 2026-05-11: no feat
        { period: '2026-05-12', prefix: 'feat', count: 2 },
      ],
      baselinePerCategory: new Map([[0, 0], [1, 0], [2, 0]]),
      baselineRegression: 0,
      baselineTotal: 0,
      regressionByPeriod: [],
    });
    expect(dataset.map((r) => r.c0)).toEqual([5, 5, 7]);
  });
});
