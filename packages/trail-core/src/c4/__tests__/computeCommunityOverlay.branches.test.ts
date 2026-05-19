/**
 * Additional branch tests for computeCommunityOverlay:
 * - indexByPath: node id with no colon → skip (line 37)
 * - indexByPath: second node with same path → reuses existing array (line 40 else)
 * - pickByRepo: empty candidates → returns undefined (line 62)
 * - nodesByPath.size === 0 → returns empty map (line 95)
 * - L4: code element without FILE_PREFIX → skip (line 103)
 * - L3: descendant id not starting with FILE_PREFIX → skip (line 127)
 * - communitySummaries is undefined → communitySummary is undefined (line 115)
 */
import { computeCommunityOverlay } from '../computeCommunityOverlay';
import type { C4Model } from '../types';
import type { CodeGraph } from '../../codeGraph';

function makeCodeGraph(overrides: Partial<CodeGraph> = {}): CodeGraph {
  return {
    generatedAt: '2026-05-01T00:00:00Z',
    repositories: [{ id: 'repoA', label: 'RepoA', path: '/repo/a' }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
    ...overrides,
  };
}

function makeC4Model(elements: C4Model['elements']): C4Model {
  return { level: 'code', elements, relationships: [] };
}

describe('computeCommunityOverlay additional branches', () => {
  test('indexByPath: node id without colon is skipped → nodesByPath.size=0 → empty result', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        // id without colon → skipped by indexByPath
        {
          id: 'no-colon-here', label: 'a', repo: 'repoA', package: 'pkg',
          fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1,
        },
      ],
    });
    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    // nodesByPath.size === 0 after skipping all nodes → returns empty
    expect(result.size).toBe(0);
  });

  test('indexByPath: two nodes with same path → array reused (else branch at line 40)', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
        { id: 'repoB:a', label: 'a', repo: 'repoB', package: 'pkg', fileType: 'code', community: 2, communityLabel: 'Y', x: 0, y: 0, size: 1 },
      ],
    });
    // selectedRepo='repoA' → picks community 1
    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.get('file::a.ts')?.dominantCommunity).toBe(1);
  });

  test('L4: non-code element is skipped (only code type processed)', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a.ts' },
      { id: 'pkg_x', type: 'container', name: 'Container' }, // not code → skipped
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 5, communityLabel: 'Z', x: 0, y: 0, size: 1 },
      ],
    });
    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.has('pkg_x')).toBe(false);
    expect(result.has('file::a.ts')).toBe(true);
  });

  test('L4: code element without file:: prefix is skipped (line 103)', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/bar', type: 'code', name: 'bar' }, // code but no file:: prefix
      { id: 'file::a.ts', type: 'code', name: 'a.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 3, communityLabel: 'X', x: 0, y: 0, size: 1 },
      ],
    });
    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.has('pkg_foo/bar')).toBe(false);
    expect(result.has('file::a.ts')).toBe(true);
  });

  test('L4: communitySummaries is undefined → no communitySummary on entry', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
      ],
      // no communitySummaries field
    });
    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.get('file::a.ts')?.communitySummary).toBeUndefined();
  });

  test('L3: descendant that is not file:: prefix is skipped (line 127)', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/comp', type: 'component', name: 'comp' },
      { id: 'pkg_foo/comp/child', type: 'component', name: 'child', boundaryId: 'pkg_foo/comp' }, // no file:: → skipped
      { id: 'file::src/actual.ts', type: 'code', name: 'actual.ts', boundaryId: 'pkg_foo/comp' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:src/actual', label: 'actual', repo: 'repoA', package: 'pkg', fileType: 'code', community: 7, communityLabel: 'X', x: 0, y: 0, size: 1 },
      ],
    });
    const result = computeCommunityOverlay(c4Model, codeGraph, 3, 'repoA');
    const entry = result.get('pkg_foo/comp');
    expect(entry?.dominantCommunity).toBe(7);
  });
});
