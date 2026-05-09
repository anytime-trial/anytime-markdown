import { aggregateQualityRates, aggregateCommitPrefixStats } from '../combinedDataAggregators';

// ---------------------------------------------------------------------------
// aggregateQualityRates
// ---------------------------------------------------------------------------

describe('aggregateQualityRates', () => {
  it('returns empty array when all inputs are empty', () => {
    expect(aggregateQualityRates([], [], [])).toEqual([]);
  });

  it('calculates retry rate, build fail rate, and test fail rate correctly', () => {
    const buildTestRows = [
      { period: '2026-05-01', build_runs: 10, build_fails: 2, test_runs: 5, test_fails: 1 },
    ];
    const editRows = [{ period: '2026-05-01', total_edits: 40 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 8 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe('2026-05-01');
    expect(result[0]!.retryRate).toBeCloseTo(20);      // 8/40 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(20);  // 2/10 * 100
    expect(result[0]!.testFailRate).toBeCloseTo(20);   // 1/5  * 100
  });

  it('returns null retryRate when edits = 0', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 4, build_fails: 1, test_runs: 0, test_fails: 0 }];
    const editRows: Record<string, unknown>[] = [];
    const retryRows: Record<string, unknown>[] = [];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.retryRate).toBeNull();
  });

  it('returns null buildFailRate when build_runs = 0', () => {
    const buildTestRows: Record<string, unknown>[] = [];
    const editRows = [{ period: '2026-05-01', total_edits: 10 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 2 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.buildFailRate).toBeNull();
    expect(result[0]!.testFailRate).toBeNull();
  });

  it('returns null testFailRate when test_runs = 0', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 5, build_fails: 0, test_runs: 0, test_fails: 0 }];
    const editRows: Record<string, unknown>[] = [];
    const retryRows: Record<string, unknown>[] = [];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.testFailRate).toBeNull();
  });

  it('handles multiple periods and sorts by period ascending', () => {
    const buildTestRows = [
      { period: '2026-05-03', build_runs: 6, build_fails: 3, test_runs: 2, test_fails: 2 },
      { period: '2026-05-01', build_runs: 10, build_fails: 0, test_runs: 0, test_fails: 0 },
    ];
    const editRows = [
      { period: '2026-05-03', total_edits: 20 },
      { period: '2026-05-01', total_edits: 50 },
    ];
    const retryRows = [
      { period: '2026-05-03', total_retries: 4 },
      { period: '2026-05-01', total_retries: 10 },
    ];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(2);
    expect(result[0]!.period).toBe('2026-05-01');
    expect(result[1]!.period).toBe('2026-05-03');
    expect(result[0]!.buildFailRate).toBeCloseTo(0);   // 0/10 * 100
    expect(result[1]!.buildFailRate).toBeCloseTo(50);  // 3/6  * 100
    expect(result[1]!.testFailRate).toBeCloseTo(100);  // 2/2  * 100
    expect(result[1]!.retryRate).toBeCloseTo(20);      // 4/20 * 100
  });

  it('merges data from the three sources into a single entry per period', () => {
    // buildTestRows にない period が editRows にある場合も統合されること
    const buildTestRows = [{ period: '2026-05-01', build_runs: 4, build_fails: 2, test_runs: 0, test_fails: 0 }];
    const editRows = [{ period: '2026-05-01', total_edits: 20 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 5 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(1);
    expect(result[0]!.retryRate).toBeCloseTo(25);     // 5/20 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(50); // 2/4  * 100
    expect(result[0]!.testFailRate).toBeNull();
  });

  it('handles week period keys', () => {
    const buildTestRows = [{ period: '2026-W19', build_runs: 8, build_fails: 4, test_runs: 4, test_fails: 1 }];
    const editRows = [{ period: '2026-W19', total_edits: 100 }];
    const retryRows = [{ period: '2026-W19', total_retries: 15 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.period).toBe('2026-W19');
    expect(result[0]!.retryRate).toBeCloseTo(15);     // 15/100 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(50); // 4/8    * 100
    expect(result[0]!.testFailRate).toBeCloseTo(25);  // 1/4    * 100
  });

  it('returns 0% rates when all runs are successful', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 10, build_fails: 0, test_runs: 5, test_fails: 0 }];
    const editRows = [{ period: '2026-05-01', total_edits: 30 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 0 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.retryRate).toBeCloseTo(0);
    expect(result[0]!.buildFailRate).toBeCloseTo(0);
    expect(result[0]!.testFailRate).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateCommitPrefixStats
// ---------------------------------------------------------------------------

describe('aggregateCommitPrefixStats', () => {
  it('returns empty array when commitRows is empty', () => {
    expect(aggregateCommitPrefixStats([], '2026-05-09')).toEqual([]);
  });

  it('aggregates a single commit correctly', () => {
    const rows = [{ period: '2026-05-09', subject: 'feat: add login', linesAdded: 100, linesDeleted: 10 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe('2026-05-09');
    expect(result[0]!.prefix).toBe('feat');
    expect(result[0]!.count).toBe(1);
    expect(result[0]!.linesAdded).toBe(100);
    expect(result[0]!.linesDeleted).toBe(10);
  });

  it('sums linesAdded and linesDeleted for same period+prefix', () => {
    const rows = [
      { period: '2026-05-09', subject: 'fix: bug A', linesAdded: 30, linesDeleted: 5 },
      { period: '2026-05-09', subject: 'fix: bug B', linesAdded: 20, linesDeleted: 8 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.prefix).toBe('fix');
    expect(result[0]!.count).toBe(2);
    expect(result[0]!.linesAdded).toBe(50);
    expect(result[0]!.linesDeleted).toBe(13);
  });

  it('produces separate entries for different prefixes in the same period', () => {
    const rows = [
      { period: '2026-05-09', subject: 'feat: X', linesAdded: 100, linesDeleted: 0 },
      { period: '2026-05-09', subject: 'fix: Y', linesAdded: 10, linesDeleted: 5 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');
    const prefixes = result.map(r => r.prefix).sort();

    expect(result).toHaveLength(2);
    expect(prefixes).toEqual(['feat', 'fix']);
  });

  it('filters out commits with period > todayPeriod', () => {
    const rows = [
      { period: '2026-05-09', subject: 'feat: present', linesAdded: 50, linesDeleted: 0 },
      { period: '2026-05-10', subject: 'feat: future', linesAdded: 200, linesDeleted: 0 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.linesAdded).toBe(50);
  });

  it('includes commits with period === todayPeriod', () => {
    const rows = [{ period: '2026-05-09', subject: 'refactor: clean', linesAdded: 60, linesDeleted: 40 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.prefix).toBe('refactor');
  });

  it('assigns "other" prefix for non-conventional commits', () => {
    const rows = [{ period: '2026-05-09', subject: 'Merge branch main', linesAdded: 5, linesDeleted: 0 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('other');
  });

  it('handles multiple periods correctly', () => {
    const rows = [
      { period: '2026-05-08', subject: 'feat: day1', linesAdded: 100, linesDeleted: 20 },
      { period: '2026-05-09', subject: 'fix: day2', linesAdded: 30, linesDeleted: 5 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');
    const sorted = [...result].sort((a, b) => a.period.localeCompare(b.period));

    expect(result).toHaveLength(2);
    expect(sorted[0]!.period).toBe('2026-05-08');
    expect(sorted[0]!.prefix).toBe('feat');
    expect(sorted[1]!.period).toBe('2026-05-09');
    expect(sorted[1]!.prefix).toBe('fix');
  });

  it('handles week period keys', () => {
    const rows = [
      { period: '2026-W18', subject: 'feat: A', linesAdded: 50, linesDeleted: 10 },
      { period: '2026-W19', subject: 'feat: B', linesAdded: 80, linesDeleted: 20 },
      { period: '2026-W20', subject: 'feat: C', linesAdded: 200, linesDeleted: 0 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-W19');
    const periods = result.map(r => r.period).sort();

    expect(periods).toEqual(['2026-W18', '2026-W19']);
  });

  it('handles scoped conventional commits', () => {
    const rows = [{ period: '2026-05-09', subject: 'fix(auth): handle token expiry', linesAdded: 15, linesDeleted: 3 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('fix');
  });

  it('handles breaking change marker in prefix', () => {
    const rows = [{ period: '2026-05-09', subject: 'refactor!: remove deprecated API', linesAdded: 0, linesDeleted: 200 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('refactor');
  });
});
