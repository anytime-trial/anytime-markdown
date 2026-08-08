import { computeSubagentTypeConfidenceCoupling } from '../../temporalCoupling/computeSubagentTypeConfidenceCoupling';
import type {
  ComputeConfidenceCouplingOptions,
  SubagentTypeFileRow,
} from '../../temporalCoupling/types';

const baseOptions: ComputeConfidenceCouplingOptions = {
  minChangeCount: 1,
  confidenceThreshold: 0,
  directionalDiffThreshold: 0.3,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('computeSubagentTypeConfidenceCoupling', () => {
  it('returns empty array for empty input', () => {
    expect(computeSubagentTypeConfidenceCoupling([], baseOptions)).toEqual([]);
  });

  it('counts the same file once per subagentType even if it appears multiple times', () => {
    // general-purpose 内で a.ts が 2 行、b.ts が 1 行 → 集合は {a, b}
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'general-purpose', filePath: 'a.ts' },
      { subagentType: 'general-purpose', filePath: 'a.ts' },
      { subagentType: 'general-purpose', filePath: 'b.ts' },
    ];
    const result = computeSubagentTypeConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      coChangeCount: 1,
      sourceChangeCount: 1,
      targetChangeCount: 1,
      jaccard: 1.0,
    });
  });

  it('points arrow from driver subagent-file to dependent subagent-file on strong asymmetry', () => {
    // auth.ts: 4 役割が触る、login.ts: general-purpose のみ → co=1
    // C(auth→login) = 1/4 = 0.25
    // C(login→auth) = 1/1 = 1.0
    // diff = 0.75 ≥ 0.3 → directed, primary = login→auth
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'general-purpose', filePath: 'auth.ts' },
      { subagentType: 'general-purpose', filePath: 'login.ts' },
      { subagentType: 'code-reviewer', filePath: 'auth.ts' },
      { subagentType: 'Explore', filePath: 'auth.ts' },
      { subagentType: 'Plan', filePath: 'auth.ts' },
    ];
    const result = computeSubagentTypeConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('A→B');
    expect(result[0].source).toBe('login.ts');
    expect(result[0].target).toBe('auth.ts');
    expect(result[0].confidenceForward).toBeCloseTo(1.0, 5);
    expect(result[0].confidenceBackward).toBeCloseTo(0.25, 5);
  });

  it('keeps pair undirected when diff is below directionalDiffThreshold', () => {
    // a in 5 役割、b in 4 役割（a と同一の 4 役割）, co=4
    // C(a→b)=4/5=0.8, C(b→a)=1.0, diff=0.2 < 0.3 → undirected
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'r1', filePath: 'a.ts' },
      { subagentType: 'r1', filePath: 'b.ts' },
      { subagentType: 'r2', filePath: 'a.ts' },
      { subagentType: 'r2', filePath: 'b.ts' },
      { subagentType: 'r3', filePath: 'a.ts' },
      { subagentType: 'r3', filePath: 'b.ts' },
      { subagentType: 'r4', filePath: 'a.ts' },
      { subagentType: 'r4', filePath: 'b.ts' },
      { subagentType: 'r5', filePath: 'a.ts' },
    ];
    const result = computeSubagentTypeConfidenceCoupling(rows, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe('undirected');
    expect(result[0].source).toBe('a.ts');
    expect(result[0].target).toBe('b.ts');
  });

  it('drops pairs whose primary confidence is below confidenceThreshold', () => {
    // a in r1..r4 (4), b in r1..r3, r5..r10 (9), co=3 → primary 0.75
    const rows: SubagentTypeFileRow[] = [
      { subagentType: 'r1', filePath: 'a.ts' },
      { subagentType: 'r1', filePath: 'b.ts' },
      { subagentType: 'r2', filePath: 'a.ts' },
      { subagentType: 'r2', filePath: 'b.ts' },
      { subagentType: 'r3', filePath: 'a.ts' },
      { subagentType: 'r3', filePath: 'b.ts' },
      { subagentType: 'r4', filePath: 'a.ts' },
      { subagentType: 'r5', filePath: 'b.ts' },
      { subagentType: 'r6', filePath: 'b.ts' },
      { subagentType: 'r7', filePath: 'b.ts' },
      { subagentType: 'r8', filePath: 'b.ts' },
      { subagentType: 'r9', filePath: 'b.ts' },
      { subagentType: 'r10', filePath: 'b.ts' },
    ];
    const dropped = computeSubagentTypeConfidenceCoupling(rows, {
      ...baseOptions,
      confidenceThreshold: 0.8,
    });
    expect(dropped).toHaveLength(0);

    const kept = computeSubagentTypeConfidenceCoupling(rows, {
      ...baseOptions,
      confidenceThreshold: 0.5,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe('a.ts');
    expect(kept[0].target).toBe('b.ts');
  });

  it('respects topK ordered by primary confidence', () => {
    const rows: SubagentTypeFileRow[] = [
      // pair1: x-y both in r1, r2 → primary 1.0, undirected
      { subagentType: 'r1', filePath: 'x.ts' },
      { subagentType: 'r1', filePath: 'y.ts' },
      { subagentType: 'r2', filePath: 'x.ts' },
      { subagentType: 'r2', filePath: 'y.ts' },
      // pair2: p in r3..r5 (3), q in r3..r4 (2) → C(q→p)=1.0
      { subagentType: 'r3', filePath: 'p.ts' },
      { subagentType: 'r3', filePath: 'q.ts' },
      { subagentType: 'r4', filePath: 'p.ts' },
      { subagentType: 'r4', filePath: 'q.ts' },
      { subagentType: 'r5', filePath: 'p.ts' },
      // pair3: m in r6 (1), n in r6..r10 (5) → C(m→n)=1.0 弱集約
      { subagentType: 'r6', filePath: 'm.ts' },
      { subagentType: 'r6', filePath: 'n.ts' },
      { subagentType: 'r7', filePath: 'n.ts' },
      { subagentType: 'r8', filePath: 'n.ts' },
      { subagentType: 'r9', filePath: 'n.ts' },
      { subagentType: 'r10', filePath: 'n.ts' },
    ];
    const result = computeSubagentTypeConfidenceCoupling(rows, {
      ...baseOptions,
      topK: 2,
    });
    expect(result).toHaveLength(2);
    const primaryConfidences = result.map((e) => e.confidenceForward);
    expect(primaryConfidences[0]).toBeGreaterThanOrEqual(primaryConfidences[1]);
  });
});
