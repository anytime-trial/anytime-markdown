import type { C4Model } from '../types';
import type { ConfidenceCouplingEdge, TemporalCouplingEdge } from '../../temporalCoupling/types';
import { aggregateGhostEdgesToC4 } from '../aggregateGhostEdgesToC4';

describe('aggregateGhostEdgesToC4 (L4)', () => {
  it('maps file-path edges to file:: element ids 1:1', () => {
    const c4Model: C4Model = {
      level: 'code',
      elements: [
        { id: 'file::src/a.ts', type: 'code', name: 'a.ts' },
        { id: 'file::src/b.ts', type: 'code', name: 'b.ts' },
      ],
      relationships: [],
    };
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a.ts', target: 'src/b.ts', jaccard: 0.8, coChangeCount: 5, sourceChangeCount: 10, targetChangeCount: 8 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 4, null);
    expect(result).toEqual([
      { source: 'file::src/a.ts', target: 'file::src/b.ts', jaccard: 0.8, coChangeCount: 5 },
    ]);
  });

  it('strips .ts/.tsx/.md/.mdx extensions for matching', () => {
    const c4Model: C4Model = {
      level: 'code',
      elements: [
        { id: 'file::src/a.tsx', type: 'code', name: 'a' },
        { id: 'file::docs/readme.md', type: 'code', name: 'readme' },
      ],
      relationships: [],
    };
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a.tsx', target: 'docs/readme.md', jaccard: 0.5, coChangeCount: 2, sourceChangeCount: 4, targetChangeCount: 4 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 4, null);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('file::src/a.tsx');
    expect(result[0]?.target).toBe('file::docs/readme.md');
  });

  it('skips edges with no matching elements', () => {
    const c4Model: C4Model = {
      level: 'code',
      elements: [{ id: 'file::src/a.ts', type: 'code', name: 'a' }],
      relationships: [],
    };
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a.ts', target: 'src/missing.ts', jaccard: 0.5, coChangeCount: 1, sourceChangeCount: 1, targetChangeCount: 1 },
    ];
    expect(aggregateGhostEdgesToC4(edges, c4Model, 4, null)).toEqual([]);
  });
});

describe('aggregateGhostEdgesToC4 (L3)', () => {
  const c4Model: C4Model = {
    level: 'component',
    elements: [
      { id: 'pkg_compA', type: 'component', name: 'compA' },
      { id: 'pkg_compB', type: 'component', name: 'compB' },
      { id: 'file::src/a/x.ts', type: 'code', name: 'x', boundaryId: 'pkg_compA' },
      { id: 'file::src/a/y.ts', type: 'code', name: 'y', boundaryId: 'pkg_compA' },
      { id: 'file::src/b/z.ts', type: 'code', name: 'z', boundaryId: 'pkg_compB' },
    ],
    relationships: [],
  };

  it('aggregates file pairs to component pairs with max(jaccard) and sum(coChangeCount)', () => {
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a/x.ts', target: 'src/b/z.ts', jaccard: 0.4, coChangeCount: 3, sourceChangeCount: 5, targetChangeCount: 5 },
      { source: 'src/a/y.ts', target: 'src/b/z.ts', jaccard: 0.7, coChangeCount: 4, sourceChangeCount: 6, targetChangeCount: 6 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      source: 'pkg_compA',
      target: 'pkg_compB',
      jaccard: 0.7,
      coChangeCount: 7,
    });
  });

  it('excludes self-loops where both files belong to the same component', () => {
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a/x.ts', target: 'src/a/y.ts', jaccard: 0.9, coChangeCount: 8, sourceChangeCount: 10, targetChangeCount: 10 },
    ];
    expect(aggregateGhostEdgesToC4(edges, c4Model, 3, null)).toEqual([]);
  });

  it('treats (A,B) and (B,A) as the same pair', () => {
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/a/x.ts', target: 'src/b/z.ts', jaccard: 0.3, coChangeCount: 2, sourceChangeCount: 4, targetChangeCount: 4 },
      { source: 'src/b/z.ts', target: 'src/a/y.ts', jaccard: 0.5, coChangeCount: 3, sourceChangeCount: 5, targetChangeCount: 5 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result).toHaveLength(1);
    expect(result[0]?.jaccard).toBe(0.5);
    expect(result[0]?.coChangeCount).toBe(5);
  });

  it('returns deterministic order (source id ascending)', () => {
    const edges: TemporalCouplingEdge[] = [
      { source: 'src/b/z.ts', target: 'src/a/x.ts', jaccard: 0.5, coChangeCount: 2, sourceChangeCount: 4, targetChangeCount: 4 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result[0]?.source).toBe('pkg_compA');
    expect(result[0]?.target).toBe('pkg_compB');
  });
});

describe('aggregateGhostEdgesToC4 (L1/L2)', () => {
  it('returns empty array for L1', () => {
    const c4Model: C4Model = { level: 'context', elements: [], relationships: [] };
    expect(aggregateGhostEdgesToC4([], c4Model, 1, null)).toEqual([]);
  });

  it('returns empty array for L2', () => {
    const c4Model: C4Model = { level: 'container', elements: [], relationships: [] };
    expect(aggregateGhostEdgesToC4([], c4Model, 2, null)).toEqual([]);
  });
});

describe('aggregateGhostEdgesToC4 (multi-level boundary traversal)', () => {
  it('finds component ancestor through intermediate container boundary', () => {
    // file → container → component (non-component boundary traversal: lines 85-87)
    const c4Model: C4Model = {
      level: 'component',
      elements: [
        { id: 'pkg_compA', type: 'component', name: 'compA' },
        { id: 'pkg_compB', type: 'component', name: 'compB' },
        // Intermediate container between file and component
        { id: 'pkg_container', type: 'container', name: 'container', boundaryId: 'pkg_compA' },
        { id: 'file::src/a/x.ts', type: 'code', name: 'x', boundaryId: 'pkg_container' },
        { id: 'file::src/b/z.ts', type: 'code', name: 'z', boundaryId: 'pkg_compB' },
      ],
      relationships: [],
    };
    const edges: import('../../temporalCoupling/types').TemporalCouplingEdge[] = [
      { source: 'src/a/x.ts', target: 'src/b/z.ts', jaccard: 0.6, coChangeCount: 3, sourceChangeCount: 5, targetChangeCount: 5 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('pkg_compA');
    expect(result[0]?.target).toBe('pkg_compB');
  });

  it('skips file with no component ancestor in boundary chain', () => {
    // file → container → system (no component found: line 87 return null)
    const c4Model: C4Model = {
      level: 'component',
      elements: [
        { id: 'pkg_compA', type: 'component', name: 'compA' },
        { id: 'sys_root', type: 'system', name: 'root' },
        { id: 'pkg_container', type: 'container', name: 'container', boundaryId: 'sys_root' },
        { id: 'file::src/orphan.ts', type: 'code', name: 'orphan', boundaryId: 'pkg_container' },
        { id: 'file::src/b.ts', type: 'code', name: 'b', boundaryId: 'pkg_compA' },
      ],
      relationships: [],
    };
    const edges: import('../../temporalCoupling/types').TemporalCouplingEdge[] = [
      { source: 'src/orphan.ts', target: 'src/b.ts', jaccard: 0.5, coChangeCount: 2, sourceChangeCount: 3, targetChangeCount: 3 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result).toHaveLength(0);
  });

  it('sorts by target when source is equal (line 143)', () => {
    const c4Model: C4Model = {
      level: 'component',
      elements: [
        { id: 'pkg_compA', type: 'component', name: 'compA' },
        { id: 'pkg_compB', type: 'component', name: 'compB' },
        { id: 'pkg_compC', type: 'component', name: 'compC' },
        { id: 'file::src/a.ts', type: 'code', name: 'a', boundaryId: 'pkg_compA' },
        { id: 'file::src/b.ts', type: 'code', name: 'b', boundaryId: 'pkg_compB' },
        { id: 'file::src/c.ts', type: 'code', name: 'c', boundaryId: 'pkg_compC' },
      ],
      relationships: [],
    };
    const edges: import('../../temporalCoupling/types').TemporalCouplingEdge[] = [
      { source: 'src/a.ts', target: 'src/c.ts', jaccard: 0.4, coChangeCount: 1, sourceChangeCount: 2, targetChangeCount: 2 },
      { source: 'src/a.ts', target: 'src/b.ts', jaccard: 0.5, coChangeCount: 2, sourceChangeCount: 3, targetChangeCount: 3 },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result).toHaveLength(2);
    expect(result[0]?.source).toBe('pkg_compA');
    expect(result[0]?.target).toBe('pkg_compB');
    expect(result[1]?.target).toBe('pkg_compC');
  });
});

describe('aggregateGhostEdgesToC4 (directional)', () => {
  const c4Model: C4Model = {
    level: 'component',
    elements: [
      { id: 'pkg_compA', type: 'component', name: 'compA' },
      { id: 'pkg_compB', type: 'component', name: 'compB' },
      { id: 'file::src/a.ts', type: 'code', name: 'a', boundaryId: 'pkg_compA' },
      { id: 'file::src/b.ts', type: 'code', name: 'b', boundaryId: 'pkg_compB' },
    ],
    relationships: [],
  };

  it('preserves direction and confidence at L4', () => {
    const edges: ConfidenceCouplingEdge[] = [
      {
        source: 'src/a.ts',
        target: 'src/b.ts',
        direction: 'A→B',
        confidenceForward: 0.9,
        confidenceBackward: 0.3,
        jaccard: 0.7,
        coChangeCount: 5,
        sourceChangeCount: 6,
        targetChangeCount: 7,
      },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 4, null);
    expect(result[0]?.direction).toBe('A→B');
    expect(result[0]?.confidenceForward).toBe(0.9);
    expect(result[0]?.confidenceBackward).toBe(0.3);
  });

  it('takes max of confidence at L3 aggregation', () => {
    const edges: ConfidenceCouplingEdge[] = [
      {
        source: 'src/a.ts',
        target: 'src/b.ts',
        direction: 'A→B',
        confidenceForward: 0.5,
        confidenceBackward: 0.2,
        jaccard: 0.4,
        coChangeCount: 2,
        sourceChangeCount: 4,
        targetChangeCount: 5,
      },
      {
        source: 'src/a.ts',
        target: 'src/b.ts',
        direction: 'A→B',
        confidenceForward: 0.8,
        confidenceBackward: 0.1,
        jaccard: 0.6,
        coChangeCount: 3,
        sourceChangeCount: 5,
        targetChangeCount: 6,
      },
    ];
    const result = aggregateGhostEdgesToC4(edges, c4Model, 3, null);
    expect(result[0]?.confidenceForward).toBe(0.8);
    expect(result[0]?.confidenceBackward).toBe(0.2);
  });
});
