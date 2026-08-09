import { computeTemporalCoupling } from '../../temporalCoupling/computeTemporalCoupling';
import type {
  CommitFileRow,
  ComputeTemporalCouplingOptions,
} from '../../temporalCoupling/types';

const baseOptions: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('computeTemporalCoupling', () => {
  it('returns empty array for empty input', () => {
    expect(computeTemporalCoupling([], baseOptions)).toEqual([]);
  });

  it('generates a pair from a single commit with two files (Jaccard=1.0)', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'a.ts',
      target: 'b.ts',
      coChangeCount: 1,
      sourceChangeCount: 1,
      targetChangeCount: 1,
      jaccard: 1.0,
    });
  });

  it('returns Jaccard=1.0 when two files share identical commit sets', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].jaccard).toBe(1.0);
    expect(result[0].coChangeCount).toBe(2);
  });

  it('computes correct Jaccard when only some commits overlap', () => {
    // a: c1, c2, c3 / b: c2, c3, c4 → intersection=2, union=4, J=0.5
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
      { commitHash: 'c3', filePath: 'a.ts' },
      { commitHash: 'c3', filePath: 'b.ts' },
      { commitHash: 'c4', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].coChangeCount).toBe(2);
    expect(result[0].sourceChangeCount).toBe(3);
    expect(result[0].targetChangeCount).toBe(3);
    expect(result[0].jaccard).toBeCloseTo(0.5, 5);
  });

  it('excludes files whose change count is below minChangeCount', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
      { commitHash: 'c3', filePath: 'a.ts' },
      { commitHash: 'c3', filePath: 'b.ts' },
      { commitHash: 'c1', filePath: 'rare.ts' },
    ];
    const result = computeTemporalCoupling(rows, {
      ...baseOptions,
      minChangeCount: 2,
    });
    const filesInResult = new Set(
      result.flatMap((e) => [e.source, e.target]),
    );
    expect(filesInResult.has('rare.ts')).toBe(false);
  });

  it('drops pairs whose Jaccard is below jaccardThreshold', () => {
    // J = 1/3 ≈ 0.333
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c3', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, {
      ...baseOptions,
      jaccardThreshold: 0.5,
    });
    expect(result).toHaveLength(0);
  });

  it('respects excludePairs (undirected)', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, {
      ...baseOptions,
      excludePairs: [['b.ts', 'a.ts']],
    });
    expect(result).toHaveLength(0);
  });

  it('limits results to topK by Jaccard descending', () => {
    // Three pairs with different Jaccard values
    const rows: CommitFileRow[] = [
      // a-b: J=1.0 (both in c1, c2)
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'b.ts' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
      // c-d: J=0.5 (c only in c3, d only in c3, c4)
      { commitHash: 'c3', filePath: 'c.ts' },
      { commitHash: 'c3', filePath: 'd.ts' },
      { commitHash: 'c4', filePath: 'd.ts' },
      { commitHash: 'c5', filePath: 'c.ts' },
      // e-f: J=0.333
      { commitHash: 'c6', filePath: 'e.ts' },
      { commitHash: 'c6', filePath: 'f.ts' },
      { commitHash: 'c7', filePath: 'e.ts' },
      { commitHash: 'c8', filePath: 'f.ts' },
    ];
    const result = computeTemporalCoupling(rows, {
      ...baseOptions,
      topK: 2,
    });
    expect(result).toHaveLength(2);
    expect(result[0].jaccard).toBeGreaterThan(result[1].jaccard);
  });

  it('skips commits whose file count exceeds maxFilesPerCommit', () => {
    const bigCommit: CommitFileRow[] = Array.from({ length: 60 }, (_, i) => ({
      commitHash: 'big',
      filePath: `big-${i}.ts`,
    }));
    const normalCommit: CommitFileRow[] = [
      { commitHash: 'n1', filePath: 'a.ts' },
      { commitHash: 'n1', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling([...bigCommit, ...normalCommit], {
      ...baseOptions,
      maxFilesPerCommit: 50,
    });
    // Only the normal commit pair survives
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('a.ts');
    expect(result[0].target).toBe('b.ts');
  });

  it('applies pathFilter to drop matching files', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'a.ts' },
      { commitHash: 'c1', filePath: 'package-lock.json' },
      { commitHash: 'c2', filePath: 'a.ts' },
      { commitHash: 'c2', filePath: 'b.ts' },
    ];
    const result = computeTemporalCoupling(rows, {
      ...baseOptions,
      pathFilter: (p) => !p.endsWith('.json'),
    });
    const files = new Set(result.flatMap((e) => [e.source, e.target]));
    expect(files.has('package-lock.json')).toBe(false);
    expect(files.has('a.ts')).toBe(true);
    expect(files.has('b.ts')).toBe(true);
  });

  it('normalizes pair ordering so source < target', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'z.ts' },
      { commitHash: 'c1', filePath: 'a.ts' },
    ];
    const result = computeTemporalCoupling(rows, baseOptions);
    expect(result[0].source).toBe('a.ts');
    expect(result[0].target).toBe('z.ts');
  });
});
