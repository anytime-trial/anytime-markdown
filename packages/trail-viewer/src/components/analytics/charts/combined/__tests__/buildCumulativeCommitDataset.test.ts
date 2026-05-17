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
      baselineFix: 5,
      baselineTotal: 15,
    });
    // baseline fix=5 / total=15 = 33.33%
    // Period 1: fix=5+1=6, total=15+3=18 -> 33.33%
    // Period 2: fix=6+0=6, total=18+3=21 -> 28.57%
    // Period 3: fix=6+0=6, total=21+1=22 -> 27.27%
    expect(dataset[0]!.c0).toBe(12);
    expect(dataset[0]!.c1).toBe(6);
    expect(dataset[0]!.c2).toBe(0);
    expect(dataset[0]!.fixRate as number).toBeCloseTo(33.333, 2);
    expect(dataset[2]!.c0).toBe(15);
    expect(dataset[2]!.c1).toBe(6);
    expect(dataset[2]!.c2).toBe(1);
    expect(dataset[2]!.fixRate as number).toBeCloseTo(27.272, 2);
  });

  it('computes cumulative fix ratio including baseline', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitRows: [
        { period: '2026-05-10', prefix: 'fix', count: 4 },
        { period: '2026-05-11', prefix: 'feat', count: 4 },
        { period: '2026-05-12', prefix: 'fix', count: 2 },
      ],
      baselinePerCategory: new Map([[0, 0], [1, 100], [2, 0]]),
      baselineFix: 100,
      baselineTotal: 100,
    });
    // baseline fix=100 / total=100 = 100%
    // Period 1: fix=100+4=104, total=100+4=104 -> 100%
    // Period 2: fix=104+0=104, total=104+4=108 -> 96.296%
    // Period 3: fix=104+2=106, total=108+2=110 -> 96.363%
    expect(dataset[0]!.fixRate as number).toBeCloseTo(100, 2);
    expect(dataset[1]!.fixRate as number).toBeCloseTo(96.296, 2);
    expect(dataset[2]!.fixRate as number).toBeCloseTo(96.363, 2);
  });

  it('returns null fix ratio when total is zero', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: ['2026-05-10'],
      commitLabels: ['05-10'],
      commitRows: [],
      baselinePerCategory: new Map([[0, 0], [1, 0], [2, 0]]),
      baselineFix: 0,
      baselineTotal: 0,
    });
    expect(dataset[0]!.fixRate).toBeNull();
  });

  it('handles empty commitRows by emitting baseline-only values', () => {
    const dataset = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: ['2026-05-10'],
      commitLabels: ['05-10'],
      commitRows: [],
      baselinePerCategory: new Map([[0, 7], [1, 3], [2, 1]]),
      baselineFix: 3,
      baselineTotal: 11,
    });
    expect(dataset[0]).toEqual({
      period: '05-10',
      c0: 7,
      c1: 3,
      c2: 1,
      fixRate: (3 / 11) * 100,
    });
  });

  it('matches end-of-window total across 7d / 30d views when callers correctly include pre-window rows in baseline', () => {
    // 全 commit (30日分): 4/17-5/10 が 20 件、5/10-5/17 が 10 件、合計 30 件 (fix 比率 30%)
    const allRows30d = [
      { period: '2026-04-20', prefix: 'feat', count: 10 },
      { period: '2026-04-20', prefix: 'fix', count: 5 },
      { period: '2026-05-05', prefix: 'feat', count: 3 },
      { period: '2026-05-05', prefix: 'fix', count: 2 },
      { period: '2026-05-15', prefix: 'feat', count: 7 },
      { period: '2026-05-15', prefix: 'fix', count: 2 },
      { period: '2026-05-17', prefix: 'fix', count: 1 },
    ];
    const periods30d = [...new Set(allRows30d.map(r => r.period))].sort();
    const labels30d = periods30d.map(p => p.slice(5));

    // 7d view 用 split: 5/10 以降を window 内、それ以前を pre-window として baseline に加算
    const cutoff7 = '2026-05-10';
    const window7d = allRows30d.filter(r => r.period >= cutoff7);
    const preWindow7d = allRows30d.filter(r => r.period < cutoff7);
    const periods7d = [...new Set(window7d.map(r => r.period))].sort();
    const labels7d = periods7d.map(p => p.slice(5));
    const baselineForCat7 = new Map([[0, 0], [1, 0], [2, 0]]);
    let baselineFix7 = 0;
    let baselineTotal7 = 0;
    for (const r of preWindow7d) {
      const cat = baseArgs.getCategory(r.prefix);
      baselineForCat7.set(cat, (baselineForCat7.get(cat) ?? 0) + r.count);
      baselineTotal7 += r.count;
      if (r.prefix === 'fix') baselineFix7 += r.count;
    }

    const dataset30d = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: periods30d,
      commitLabels: labels30d,
      commitRows: allRows30d,
      baselinePerCategory: new Map([[0, 0], [1, 0], [2, 0]]),
      baselineFix: 0,
      baselineTotal: 0,
    });
    const dataset7d = buildCumulativeCommitDataset({
      ...baseArgs,
      commitPeriods: periods7d,
      commitLabels: labels7d,
      commitRows: window7d,
      baselinePerCategory: baselineForCat7,
      baselineFix: baselineFix7,
      baselineTotal: baselineTotal7,
    });

    const last30 = dataset30d.at(-1)!;
    const last7 = dataset7d.at(-1)!;
    expect(last30.c0).toBe(last7.c0); // feat 累計
    expect(last30.c1).toBe(last7.c1); // fix 累計
    expect(last30.c2).toBe(last7.c2); // other 累計
    expect(last30.fixRate).toBeCloseTo(last7.fixRate as number, 5);
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
      baselineFix: 0,
      baselineTotal: 0,
    });
    expect(dataset.map((r) => r.c0)).toEqual([5, 5, 7]);
  });
});
