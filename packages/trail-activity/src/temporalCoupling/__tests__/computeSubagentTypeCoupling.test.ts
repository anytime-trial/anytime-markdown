import { computeSubagentTypeCoupling } from '../computeSubagentTypeCoupling';
import type { ComputeTemporalCouplingOptions, SubagentTypeFileRow } from '../types';

const BASE_OPTIONS: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

function makeRows(
  byType: Record<string, string[]>,
): SubagentTypeFileRow[] {
  return Object.entries(byType).flatMap(([subagentType, files]) =>
    files.map((filePath) => ({ subagentType, filePath })),
  );
}

describe('computeSubagentTypeCoupling', () => {
  test('returns empty array for empty input', () => {
    expect(computeSubagentTypeCoupling([], BASE_OPTIONS)).toEqual([]);
  });

  test('groups by subagentType and computes jaccard', () => {
    const rows = makeRows({
      'general-purpose': ['a.ts', 'b.ts'],
      Explore: ['a.ts', 'b.ts'],
    });
    // each "group" (subagentType) has both files → co=2, a=2, b=2, union=2, jaccard=1
    const edges = computeSubagentTypeCoupling(rows, BASE_OPTIONS);
    expect(edges).toHaveLength(1);
    expect(edges[0].coChangeCount).toBe(2);
    expect(edges[0].jaccard).toBe(1);
  });

  test('returns empty for below-threshold jaccard', () => {
    const rows = makeRows({
      'general-purpose': ['a.ts', 'b.ts'],
      Explore: ['a.ts'],
      codex: ['a.ts'],
    });
    // a appears in 3 types, b in 1. co(a,b)=1, a=3, b=1, union=3, jaccard=1/3
    const edges = computeSubagentTypeCoupling(rows, {
      ...BASE_OPTIONS,
      jaccardThreshold: 0.5,
    });
    expect(edges).toHaveLength(0);
  });

  test('topK limits results', () => {
    const rows = makeRows({
      t1: ['a.ts', 'b.ts', 'c.ts'],
      t2: ['a.ts', 'b.ts', 'c.ts'],
    });
    const edges = computeSubagentTypeCoupling(rows, { ...BASE_OPTIONS, topK: 2 });
    expect(edges).toHaveLength(2);
  });

  test('excludePairs removes the pair', () => {
    const rows = makeRows({
      t1: ['a.ts', 'b.ts'],
      t2: ['a.ts', 'b.ts'],
    });
    const edges = computeSubagentTypeCoupling(rows, {
      ...BASE_OPTIONS,
      excludePairs: [['a.ts', 'b.ts']],
    });
    expect(edges).toHaveLength(0);
  });

  test('pathFilter works', () => {
    const rows = makeRows({
      t1: ['src/a.ts', 'dist/b.js'],
      t2: ['src/a.ts', 'dist/b.js'],
    });
    const edges = computeSubagentTypeCoupling(rows, {
      ...BASE_OPTIONS,
      pathFilter: (f) => f.endsWith('.ts'),
    });
    // only src/a.ts survives, no pair
    expect(edges).toHaveLength(0);
  });

  test('maxFilesPerCommit (mapped to maxFilesPerGroup) skips large groups', () => {
    const rows = makeRows({
      t1: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });
    const edges = computeSubagentTypeCoupling(rows, {
      ...BASE_OPTIONS,
      maxFilesPerCommit: 3,
    });
    expect(edges).toHaveLength(0);
  });

  test('sorts by jaccard desc then coChangeCount desc', () => {
    const rows = makeRows({
      t1: ['a.ts', 'b.ts'],
      t2: ['a.ts', 'b.ts'],
      t3: ['c.ts', 'd.ts'],
      t4: ['c.ts', 'd.ts'],
      t5: ['c.ts', 'd.ts'],
      t6: ['c.ts'],
    });
    // a,b: co=2, a=2, b=2, union=2, jaccard=1.0
    // c,d: co=3, c=4, d=3, union=4, jaccard=0.75
    const edges = computeSubagentTypeCoupling(rows, BASE_OPTIONS);
    expect(edges[0].source).toBe('a.ts');
    expect(edges[0].jaccard).toBe(1);
    expect(edges[1].source).toBe('c.ts');
  });
});
