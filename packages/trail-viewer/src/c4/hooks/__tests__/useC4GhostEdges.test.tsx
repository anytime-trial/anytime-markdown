import { renderHook } from '@testing-library/react';
import type { C4Model } from '@anytime-markdown/trail-activity';
import { useC4GhostEdges } from '../useC4GhostEdges';

const c4Model: C4Model = {
  level: 'code',
  elements: [
    { id: 'file::src/a.ts', type: 'code', name: 'a' },
    { id: 'file::src/b.ts', type: 'code', name: 'b' },
  ],
  relationships: [],
};

const edges = [
  { source: 'src/a.ts', target: 'src/b.ts', jaccard: 0.5, coChangeCount: 2, sourceChangeCount: 3, targetChangeCount: 3 },
];

describe('useC4GhostEdges', () => {
  it('returns aggregated edges for L4', () => {
    const { result } = renderHook(() => useC4GhostEdges(edges, c4Model, 4, null));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.source).toBe('file::src/a.ts');
  });

  it('returns empty for L1', () => {
    const { result } = renderHook(() => useC4GhostEdges(edges, c4Model, 1, null));
    expect(result.current).toEqual([]);
  });

  it('returns referentially stable result for unchanged inputs', () => {
    const { result, rerender } = renderHook(
      ({ lvl }: { lvl: 1 | 2 | 3 | 4 }) => useC4GhostEdges(edges, c4Model, lvl, null),
      { initialProps: { lvl: 4 } as { lvl: 1 | 2 | 3 | 4 } },
    );
    const first = result.current;
    rerender({ lvl: 4 });
    expect(result.current).toBe(first);
  });

  it('recomputes when level changes', () => {
    const { result, rerender } = renderHook(
      ({ lvl }: { lvl: 1 | 2 | 3 | 4 }) => useC4GhostEdges(edges, c4Model, lvl, null),
      { initialProps: { lvl: 4 } as { lvl: 1 | 2 | 3 | 4 } },
    );
    const first = result.current;
    rerender({ lvl: 1 });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual([]);
  });
});
