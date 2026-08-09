import { computeConfidenceCoupling } from '../../temporalCoupling/computeConfidenceCoupling';
import { computeTemporalCoupling } from '../../temporalCoupling/computeTemporalCoupling';
import type {
  CommitFileRow,
  ComputeConfidenceCouplingOptions,
  ComputeTemporalCouplingOptions,
} from '../../temporalCoupling/types';

const phase1Options: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

const phase2Options: ComputeConfidenceCouplingOptions = {
  minChangeCount: 1,
  confidenceThreshold: 0,
  directionalDiffThreshold: 0.3,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('temporalCoupling integration: Phase 1 + Phase 2 share aggregation', () => {
  it('produces consistent jaccard/coChange counts across both functions', () => {
    // 5 commits forming three couplings of different shape:
    // - core.ts ↔ utils.ts: co-changed in 5/5 commits → symmetric
    // - core.ts → consumer.ts: consumer.ts only ever ships with core.ts (1 commit)
    // - readme.md: stand-alone, no coupling
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'core.ts' },
      { commitHash: 'c1', filePath: 'utils.ts' },
      { commitHash: 'c1', filePath: 'consumer.ts' },
      { commitHash: 'c2', filePath: 'core.ts' },
      { commitHash: 'c2', filePath: 'utils.ts' },
      { commitHash: 'c3', filePath: 'core.ts' },
      { commitHash: 'c3', filePath: 'utils.ts' },
      { commitHash: 'c4', filePath: 'core.ts' },
      { commitHash: 'c4', filePath: 'utils.ts' },
      { commitHash: 'c5', filePath: 'core.ts' },
      { commitHash: 'c5', filePath: 'utils.ts' },
      { commitHash: 'c6', filePath: 'readme.md' },
    ];

    const phase1 = computeTemporalCoupling(rows, phase1Options);
    const phase2 = computeConfidenceCoupling(rows, phase2Options);

    const phase1Map = new Map(
      phase1.map((e) => [`${e.source}|${e.target}`, e]),
    );
    expect(phase1Map.size).toBe(phase2.length);

    for (const p2 of phase2) {
      // For undirected pairs source<target; for directed pairs source=driver,
      // target=dependent. Phase 1 always normalizes to source<target.
      const lo = p2.source < p2.target ? p2.source : p2.target;
      const hi = p2.source < p2.target ? p2.target : p2.source;
      const p1 = phase1Map.get(`${lo}|${hi}`);
      expect(p1).toBeDefined();
      expect(p1!.coChangeCount).toBe(p2.coChangeCount);
      expect(p1!.jaccard).toBeCloseTo(p2.jaccard, 5);
    }
  });

  it('flags driver→dependent direction for the consumer pair', () => {
    const rows: CommitFileRow[] = [
      { commitHash: 'c1', filePath: 'core.ts' },
      { commitHash: 'c1', filePath: 'consumer.ts' },
      { commitHash: 'c2', filePath: 'core.ts' },
      { commitHash: 'c3', filePath: 'core.ts' },
      { commitHash: 'c4', filePath: 'core.ts' },
    ];
    const result = computeConfidenceCoupling(rows, phase2Options);

    const consumerEdge = result.find(
      (e) => e.source === 'consumer.ts' || e.target === 'consumer.ts',
    );
    expect(consumerEdge).toBeDefined();
    // consumer.ts → core.ts is the primary direction (consumer never ships
    // alone), so consumer is driver, core is dependent.
    expect(consumerEdge!.direction).toBe('A→B');
    expect(consumerEdge!.source).toBe('consumer.ts');
    expect(consumerEdge!.target).toBe('core.ts');
    expect(consumerEdge!.confidenceForward).toBeCloseTo(1.0, 5);
    expect(consumerEdge!.confidenceBackward).toBeCloseTo(0.25, 5);
  });

  it('respects confidenceThreshold to filter weak primary directions', () => {
    // a in c1..c10 (10), b in c1, c2 (2), co=2
    // C(b→a) = 2/2 = 1.0, C(a→b) = 2/10 = 0.2 → primary = b→a (1.0)
    const rows: CommitFileRow[] = [];
    for (let i = 1; i <= 10; i++) {
      rows.push({ commitHash: `c${i}`, filePath: 'a.ts' });
    }
    rows.push({ commitHash: 'c1', filePath: 'b.ts' });
    rows.push({ commitHash: 'c2', filePath: 'b.ts' });

    const kept = computeConfidenceCoupling(rows, {
      ...phase2Options,
      confidenceThreshold: 0.5,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].direction).toBe('A→B');
    expect(kept[0].source).toBe('b.ts');

    const dropped = computeConfidenceCoupling(rows, {
      ...phase2Options,
      confidenceThreshold: 1.01,
    });
    expect(dropped).toHaveLength(0);
  });
});
