import { computeTemporalCoupling } from '../computeTemporalCoupling';
import type { CommitFileRow, ComputeTemporalCouplingOptions } from '../types';

const BASE_OPTIONS: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

function makeRows(
  commits: Record<string, string[]>,
): CommitFileRow[] {
  return Object.entries(commits).flatMap(([commitHash, files]) =>
    files.map((filePath) => ({ commitHash, filePath })),
  );
}

describe('computeTemporalCoupling', () => {
  test('returns empty array for empty input', () => {
    expect(computeTemporalCoupling([], BASE_OPTIONS)).toEqual([]);
  });

  test('computes jaccard correctly for simple 2-file pair', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts'],
      c2: ['a.ts', 'b.ts'],
      c3: ['a.ts'],
    });
    // a changed 3x, b changed 2x, co 2x → union = 3+2-2=3 → jaccard=2/3
    const edges = computeTemporalCoupling(rows, { ...BASE_OPTIONS, minChangeCount: 2 });
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a.ts');
    expect(edges[0].target).toBe('b.ts');
    expect(edges[0].coChangeCount).toBe(2);
    expect(edges[0].jaccard).toBeCloseTo(2 / 3);
  });

  test('filters out edges below jaccardThreshold', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts'],
      c2: ['a.ts'],
      c3: ['a.ts'],
      c4: ['a.ts'],
    });
    // a=4, b=1, co=1, union=4, jaccard=0.25
    const edges = computeTemporalCoupling(rows, {
      ...BASE_OPTIONS,
      jaccardThreshold: 0.5,
    });
    expect(edges).toHaveLength(0);
  });

  test('respects minChangeCount threshold', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts'],
    });
    // only 1 change each, minChangeCount=2 should exclude
    const edges = computeTemporalCoupling(rows, {
      ...BASE_OPTIONS,
      minChangeCount: 2,
    });
    expect(edges).toHaveLength(0);
  });

  test('respects topK limit', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts', 'c.ts'],
      c2: ['a.ts', 'b.ts', 'c.ts'],
    });
    const edges = computeTemporalCoupling(rows, { ...BASE_OPTIONS, topK: 2 });
    expect(edges).toHaveLength(2);
  });

  test('skips commits with more files than maxFilesPerCommit', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts', 'c.ts'],
    });
    const edges = computeTemporalCoupling(rows, {
      ...BASE_OPTIONS,
      maxFilesPerCommit: 2,
    });
    // c1 has 3 files > max 2, so skipped
    expect(edges).toHaveLength(0);
  });

  test('excludes specified pairs', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts'],
      c2: ['a.ts', 'b.ts'],
    });
    const edges = computeTemporalCoupling(rows, {
      ...BASE_OPTIONS,
      excludePairs: [['a.ts', 'b.ts']],
    });
    expect(edges).toHaveLength(0);
  });

  test('applies pathFilter to exclude files', () => {
    const rows = makeRows({
      c1: ['src/a.ts', 'test/b.test.ts'],
      c2: ['src/a.ts', 'test/b.test.ts'],
    });
    const edges = computeTemporalCoupling(rows, {
      ...BASE_OPTIONS,
      pathFilter: (f) => !f.startsWith('test/'),
    });
    // b.test.ts excluded so no pair
    expect(edges).toHaveLength(0);
  });

  test('sorts by jaccard descending, then coChangeCount, then source, then target', () => {
    const rows = makeRows({
      c1: ['a.ts', 'b.ts'],
      c2: ['a.ts', 'b.ts'],
      c3: ['c.ts', 'd.ts'],
      c4: ['c.ts', 'd.ts'],
      c5: ['c.ts', 'd.ts'],
      c6: ['c.ts'],
    });
    // c,d: co=3, c=4, d=3, union=4, jaccard=3/4=0.75
    // a,b: co=2, a=2, b=2, union=2, jaccard=1.0
    const edges = computeTemporalCoupling(rows, BASE_OPTIONS);
    expect(edges[0].source).toBe('a.ts'); // jaccard 1.0 first
    expect(edges[1].source).toBe('c.ts'); // jaccard 0.75 second
  });

  test('normalizes pair so source < target lexicographically', () => {
    const rows = makeRows({
      c1: ['z.ts', 'a.ts'],
      c2: ['z.ts', 'a.ts'],
    });
    const edges = computeTemporalCoupling(rows, BASE_OPTIONS);
    expect(edges[0].source).toBe('a.ts');
    expect(edges[0].target).toBe('z.ts');
  });

  test('union <= 0 edge is skipped (defensive branch)', () => {
    // If both files only appear together, union = a+b-co
    // With co=2, a=2, b=2, union=2. This is normal.
    // To hit union<=0 would require co > a+b which is impossible, but let's verify typical case
    const rows = makeRows({ c1: ['a.ts', 'b.ts'], c2: ['a.ts', 'b.ts'] });
    const edges = computeTemporalCoupling(rows, BASE_OPTIONS);
    // union = 2+2-2 = 2 > 0, so edge exists
    expect(edges).toHaveLength(1);
    expect(edges[0].jaccard).toBe(1);
  });
});
