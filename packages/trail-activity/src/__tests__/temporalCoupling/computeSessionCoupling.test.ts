import { computeSessionCoupling } from '../../temporalCoupling/computeSessionCoupling';
import type {
  ComputeTemporalCouplingOptions,
  SessionFileRow,
} from '../../temporalCoupling/types';

const baseOptions: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('computeSessionCoupling', () => {
  it('returns empty for empty input', () => {
    expect(computeSessionCoupling([], baseOptions)).toEqual([]);
  });

  it('generates a pair from a single session with two files (Jaccard=1.0)', () => {
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
    ];
    const result = computeSessionCoupling(rows, baseOptions);
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

  it('returns Jaccard=1.0 when two sessions both edit the same pair', () => {
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's2', filePath: 'a.ts' },
      { sessionId: 's2', filePath: 'b.ts' },
    ];
    const result = computeSessionCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].jaccard).toBe(1.0);
    expect(result[0].coChangeCount).toBe(2);
  });

  it('computes correct Jaccard for partially overlapping sessions', () => {
    // a: s1, s2, s3 / b: s2, s3, s4 → ∩=2, ∪=4 → J=0.5
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's2', filePath: 'a.ts' },
      { sessionId: 's2', filePath: 'b.ts' },
      { sessionId: 's3', filePath: 'a.ts' },
      { sessionId: 's3', filePath: 'b.ts' },
      { sessionId: 's4', filePath: 'b.ts' },
    ];
    const result = computeSessionCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].coChangeCount).toBe(2);
    expect(result[0].sourceChangeCount).toBe(3);
    expect(result[0].targetChangeCount).toBe(3);
    expect(result[0].jaccard).toBe(0.5);
  });

  it('respects minChangeCount filter', () => {
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's2', filePath: 'c.ts' },
      { sessionId: 's2', filePath: 'd.ts' },
      { sessionId: 's3', filePath: 'c.ts' },
      { sessionId: 's3', filePath: 'd.ts' },
    ];
    const result = computeSessionCoupling(rows, {
      ...baseOptions,
      minChangeCount: 2,
    });
    // a/b は 1 セッションでのみ → 除外。 c/d は 2 セッションで残る
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('c.ts');
    expect(result[0].target).toBe('d.ts');
  });

  it('respects topK', () => {
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's2', filePath: 'c.ts' },
      { sessionId: 's2', filePath: 'd.ts' },
    ];
    const result = computeSessionCoupling(rows, { ...baseOptions, topK: 1 });
    expect(result).toHaveLength(1);
  });

  it('respects pathFilter', () => {
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's1', filePath: 'node_modules/x.js' },
    ];
    const result = computeSessionCoupling(rows, {
      ...baseOptions,
      pathFilter: (p) => !p.startsWith('node_modules/'),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'a.ts', target: 'b.ts' });
  });

  it('skips rows with empty sessionId', () => {
    const rows: SessionFileRow[] = [
      { sessionId: '', filePath: 'a.ts' },
      { sessionId: '', filePath: 'b.ts' },
      { sessionId: 's1', filePath: 'c.ts' },
      { sessionId: 's1', filePath: 'd.ts' },
    ];
    const result = computeSessionCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'c.ts', target: 'd.ts' });
  });
});
