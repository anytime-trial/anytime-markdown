import { describe, expect, test } from '@jest/globals';
import type {
  C4Element,
  C4Model,
  CommunityOverlayEntry,
  ComplexityMatrix,
  CoverageMatrix,
  DsmMatrix,
  HotspotMap,
  SizeMatrix,
} from '@anytime-markdown/trail-core/c4';
import type { HotspotEntry } from '@anytime-markdown/trail-core/c4';
import { buildDsmDegreeMap, buildSelectedElementInfo } from '../selectedElementInfo';

const c4Model: C4Model = {
  level: 'code',
  elements: [
    { id: 'pkg_foo', type: 'container', name: 'foo' } as C4Element,
    { id: 'pkg_foo/comp', type: 'component', name: 'comp', boundaryId: 'pkg_foo' } as C4Element,
    { id: 'file::packages/foo/src/comp/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_foo/comp' } as C4Element,
  ],
  relationships: [],
};

describe('buildDsmDegreeMap', () => {
  test('null matrix yields null', () => {
    expect(buildDsmDegreeMap(null, c4Model.elements)).toBeNull();
  });

  test('counts in/out degree from adjacency (row=out, col=in)', () => {
    // a -> b, a -> c, b -> c
    const dsm: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'a', path: 'a', level: 'component' },
        { id: 'b', name: 'b', path: 'b', level: 'component' },
        { id: 'c', name: 'c', path: 'c', level: 'component' },
      ],
      edges: [],
      adjacency: [
        [0, 1, 1],
        [0, 0, 1],
        [0, 0, 0],
      ],
    };
    // elements=[] にして集約レベルが直接ノード id を上書きしないようにし、行列由来の次数のみを検証する
    const map = buildDsmDegreeMap(dsm, []);
    expect(map).not.toBeNull();
    expect(map!.get('a')).toEqual({ in: 0, out: 2 });
    expect(map!.get('b')).toEqual({ in: 1, out: 1 });
    expect(map!.get('c')).toEqual({ in: 2, out: 0 });
  });
});

describe('buildSelectedElementInfo', () => {
  const codeEl = c4Model.elements.find((e) => e.type === 'code')!;

  test('resolves all metrics for the selected element', () => {
    const coverageMatrix: CoverageMatrix = {
      entries: [
        {
          elementId: codeEl.id,
          lines: { covered: 8, total: 10, pct: 80 },
          branches: { covered: 5, total: 10, pct: 50 },
          functions: { covered: 2, total: 4, pct: 50 },
        },
      ],
      generatedAt: 0,
    };
    const complexityMatrix: ComplexityMatrix = {
      entries: [{ elementId: codeEl.id, mostFrequent: 'high-complexity', highest: 'high-complexity', totalCount: 3 }],
      generatedAt: 0,
    };
    const hotspotEntry: HotspotEntry = { elementId: codeEl.id, churn: 42, churnNorm: 0.5, complexity: 3, complexityNorm: 0.3, risk: 0.7 };
    const hotspotMap: HotspotMap = new Map([[codeEl.id, hotspotEntry]]);
    const sizeMatrix: SizeMatrix = { [codeEl.id]: { loc: 120, locMax: 120, files: 1, functions: 4 } };
    const dsmDegreeMap = new Map([[codeEl.id, { in: 2, out: 3 }]]);
    const overlayL4 = new Map<string, CommunityOverlayEntry>([
      [codeEl.id, { elementId: codeEl.id, dominantCommunity: 7, dominantRatio: 1, breakdown: [{ community: 7, count: 1 }], isGodNode: false }],
    ]);

    const info = buildSelectedElementInfo({
      element: codeEl,
      c4Model,
      dsmDegreeMap,
      coverageMatrix,
      complexityMatrix,
      importanceMatrix: { [codeEl.id]: 88 },
      defectRiskMap: new Map([[codeEl.id, 55]]),
      hotspotMap,
      sizeMatrix,
      communityOverlayL3: null,
      communityOverlayL4: overlayL4,
    });

    expect(info.incoming).toBe(2);
    expect(info.outgoing).toBe(3);
    expect(info.coverage?.lines.pct).toBe(80);
    expect(info.complexity?.highest).toBe('high-complexity');
    expect(info.importance).toBe(88);
    expect(info.defectRisk).toBe(55);
    expect(info.hotspot?.churn).toBe(42);
    expect(info.community?.dominantCommunity).toBe(7);
    expect(info.sizeMetrics).toEqual({ loc: 120, locMax: 120, fileCount: 1, functionCount: 4 });
  });

  test('returns nulls when no data is available', () => {
    const info = buildSelectedElementInfo({
      element: codeEl,
      c4Model,
      dsmDegreeMap: null,
      coverageMatrix: null,
      complexityMatrix: null,
      importanceMatrix: null,
      defectRiskMap: null,
      hotspotMap: null,
      sizeMatrix: null,
      communityOverlayL3: null,
      communityOverlayL4: null,
    });

    expect(info.incoming).toBeNull();
    expect(info.outgoing).toBeNull();
    expect(info.coverage).toBeNull();
    expect(info.complexity).toBeNull();
    expect(info.importance).toBeNull();
    expect(info.defectRisk).toBeNull();
    expect(info.hotspot).toBeNull();
    expect(info.community).toBeNull();
    expect(info.sizeMetrics).toEqual({ loc: null, locMax: null, fileCount: null, functionCount: null });
  });
});
