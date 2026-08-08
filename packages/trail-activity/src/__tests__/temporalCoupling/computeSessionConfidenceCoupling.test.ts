import { computeSessionConfidenceCoupling } from '../../temporalCoupling/computeSessionConfidenceCoupling';
import type {
  ComputeConfidenceCouplingOptions,
  SessionFileRow,
} from '../../temporalCoupling/types';

const baseOptions: ComputeConfidenceCouplingOptions = {
  minChangeCount: 1,
  confidenceThreshold: 0,
  directionalDiffThreshold: 0.3,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('computeSessionConfidenceCoupling', () => {
  it('returns empty array for empty input', () => {
    expect(computeSessionConfidenceCoupling([], baseOptions)).toEqual([]);
  });

  it('counts the same file once per session even if it appears multiple times', () => {
    // s1 内で a.ts が 2 行、b.ts が 1 行 → s1 単位では a.ts/b.ts の集合に集約
    // → fileChangeCount: a=1, b=1, co=1, jaccard=1.0
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
    ];
    const result = computeSessionConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      coChangeCount: 1,
      sourceChangeCount: 1,
      targetChangeCount: 1,
      jaccard: 1.0,
    });
  });

  it('points arrow from driver session-file to dependent session-file on strong asymmetry', () => {
    // auth.ts は 4 セッション（s1..s4）、login.ts は s1 のみ → co=1
    // C(auth→login) = 1/4 = 0.25
    // C(login→auth) = 1/1 = 1.0
    // diff = 0.75 ≥ 0.3 → directed, primary = login→auth
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'auth.ts' },
      { sessionId: 's1', filePath: 'login.ts' },
      { sessionId: 's2', filePath: 'auth.ts' },
      { sessionId: 's3', filePath: 'auth.ts' },
      { sessionId: 's4', filePath: 'auth.ts' },
    ];
    const result = computeSessionConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('A→B');
    expect(result[0].source).toBe('login.ts');
    expect(result[0].target).toBe('auth.ts');
    expect(result[0].confidenceForward).toBeCloseTo(1.0, 5);
    expect(result[0].confidenceBackward).toBeCloseTo(0.25, 5);
  });

  it('keeps pair undirected when diff is below directionalDiffThreshold', () => {
    // a in s1..s5 (5), b in s1..s4 (4), co=4
    // C(a→b)=4/5=0.8, C(b→a)=1.0, diff=0.2 < 0.3 → undirected
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's2', filePath: 'a.ts' },
      { sessionId: 's2', filePath: 'b.ts' },
      { sessionId: 's3', filePath: 'a.ts' },
      { sessionId: 's3', filePath: 'b.ts' },
      { sessionId: 's4', filePath: 'a.ts' },
      { sessionId: 's4', filePath: 'b.ts' },
      { sessionId: 's5', filePath: 'a.ts' },
    ];
    const result = computeSessionConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('undirected');
    expect(result[0].source).toBe('a.ts');
    expect(result[0].target).toBe('b.ts');
  });

  it('drops pairs whose primary confidence is below confidenceThreshold', () => {
    // a in s1..s4 (4), b in s1..s3, s5..s10 (9), co=3
    // C(a→b)=0.75, C(b→a)≈0.333 → primary 0.75
    const rows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's2', filePath: 'a.ts' },
      { sessionId: 's2', filePath: 'b.ts' },
      { sessionId: 's3', filePath: 'a.ts' },
      { sessionId: 's3', filePath: 'b.ts' },
      { sessionId: 's4', filePath: 'a.ts' },
      { sessionId: 's5', filePath: 'b.ts' },
      { sessionId: 's6', filePath: 'b.ts' },
      { sessionId: 's7', filePath: 'b.ts' },
      { sessionId: 's8', filePath: 'b.ts' },
      { sessionId: 's9', filePath: 'b.ts' },
      { sessionId: 's10', filePath: 'b.ts' },
    ];
    const dropped = computeSessionConfidenceCoupling(rows, {
      ...baseOptions,
      confidenceThreshold: 0.8,
    });
    expect(dropped).toHaveLength(0);

    const kept = computeSessionConfidenceCoupling(rows, {
      ...baseOptions,
      confidenceThreshold: 0.5,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe('a.ts');
    expect(kept[0].target).toBe('b.ts');
  });

  it('respects topK ordered by primary confidence', () => {
    const rows: SessionFileRow[] = [
      // pair1: x-y both in s1, s2 → primary 1.0, undirected
      { sessionId: 's1', filePath: 'x.ts' },
      { sessionId: 's1', filePath: 'y.ts' },
      { sessionId: 's2', filePath: 'x.ts' },
      { sessionId: 's2', filePath: 'y.ts' },
      // pair2: p in s3..s5 (3), q in s3..s4 (2), co=2 → C(q→p)=1.0
      { sessionId: 's3', filePath: 'p.ts' },
      { sessionId: 's3', filePath: 'q.ts' },
      { sessionId: 's4', filePath: 'p.ts' },
      { sessionId: 's4', filePath: 'q.ts' },
      { sessionId: 's5', filePath: 'p.ts' },
      // pair3: m in s6 (1), n in s6..s10 (5), co=1 → C(m→n)=1.0
      { sessionId: 's6', filePath: 'm.ts' },
      { sessionId: 's6', filePath: 'n.ts' },
      { sessionId: 's7', filePath: 'n.ts' },
      { sessionId: 's8', filePath: 'n.ts' },
      { sessionId: 's9', filePath: 'n.ts' },
      { sessionId: 's10', filePath: 'n.ts' },
    ];
    const result = computeSessionConfidenceCoupling(rows, {
      ...baseOptions,
      topK: 2,
    });
    expect(result).toHaveLength(2);
    const primaryConfidences = result.map((e) => e.confidenceForward);
    expect(primaryConfidences[0]).toBeGreaterThanOrEqual(primaryConfidences[1]);
  });
});
