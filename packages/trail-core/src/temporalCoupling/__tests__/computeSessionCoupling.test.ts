import { computeSessionCoupling } from '../computeSessionCoupling';
import type { ComputeTemporalCouplingOptions, SessionFileRow } from '../types';

const BASE_OPTIONS: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

function makeRows(
  sessions: Record<string, string[]>,
): SessionFileRow[] {
  return Object.entries(sessions).flatMap(([sessionId, files]) =>
    files.map((filePath) => ({ sessionId, filePath })),
  );
}

describe('computeSessionCoupling', () => {
  test('returns empty array for empty input', () => {
    expect(computeSessionCoupling([], BASE_OPTIONS)).toEqual([]);
  });

  test('treats sessionId as group key', () => {
    const rows = makeRows({
      sess1: ['a.ts', 'b.ts'],
      sess2: ['a.ts', 'b.ts'],
    });
    const edges = computeSessionCoupling(rows, BASE_OPTIONS);
    expect(edges).toHaveLength(1);
    expect(edges[0].coChangeCount).toBe(2);
    expect(edges[0].jaccard).toBe(1);
  });

  test('filters edges below jaccardThreshold', () => {
    const rows = makeRows({
      s1: ['a.ts', 'b.ts'],
      s2: ['a.ts'],
      s3: ['a.ts'],
    });
    // a=3, b=1, co=1, union=3, jaccard=1/3
    const edges = computeSessionCoupling(rows, { ...BASE_OPTIONS, jaccardThreshold: 0.5 });
    expect(edges).toHaveLength(0);
  });

  test('respects topK', () => {
    const rows = makeRows({
      s1: ['a.ts', 'b.ts', 'c.ts'],
      s2: ['a.ts', 'b.ts', 'c.ts'],
    });
    const edges = computeSessionCoupling(rows, { ...BASE_OPTIONS, topK: 1 });
    expect(edges).toHaveLength(1);
  });

  test('excludePairs removes specified pair', () => {
    const rows = makeRows({
      s1: ['a.ts', 'b.ts'],
      s2: ['a.ts', 'b.ts'],
    });
    const edges = computeSessionCoupling(rows, {
      ...BASE_OPTIONS,
      excludePairs: [['b.ts', 'a.ts']],
    });
    expect(edges).toHaveLength(0);
  });

  test('pathFilter excludes specific files', () => {
    const rows = makeRows({
      s1: ['src/a.ts', 'src/b.ts', 'build/c.js'],
      s2: ['src/a.ts', 'src/b.ts', 'build/c.js'],
    });
    const edges = computeSessionCoupling(rows, {
      ...BASE_OPTIONS,
      pathFilter: (f) => f.startsWith('src/'),
    });
    // only src/a.ts and src/b.ts kept, so 1 pair
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('src/a.ts');
    expect(edges[0].target).toBe('src/b.ts');
  });

  test('maxFilesPerCommit skips oversized sessions', () => {
    const rows = makeRows({
      s1: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });
    const edges = computeSessionCoupling(rows, {
      ...BASE_OPTIONS,
      maxFilesPerCommit: 3,
    });
    expect(edges).toHaveLength(0);
  });

  test('minChangeCount filters out infrequent files', () => {
    const rows = makeRows({
      s1: ['a.ts', 'b.ts'],
    });
    // each file changed only once, minChangeCount=2 should exclude
    const edges = computeSessionCoupling(rows, {
      ...BASE_OPTIONS,
      minChangeCount: 2,
    });
    expect(edges).toHaveLength(0);
  });
});
