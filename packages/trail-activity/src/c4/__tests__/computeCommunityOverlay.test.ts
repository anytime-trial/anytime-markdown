import { describe, expect, test } from '@jest/globals';
import { computeCommunityOverlay } from '../computeCommunityOverlay';
import type { C4Model } from '../types';
import type { CodeGraph } from '../../codeGraph';

function makeCodeGraph(overrides: Partial<CodeGraph> = {}): CodeGraph {
  return {
    generatedAt: '2026-04-30T00:00:00Z',
    repositories: [{ id: 'repoA', label: 'RepoA', path: '/repo/a' }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
    ...overrides,
  };
}

function makeC4Model(elements: C4Model['elements']): C4Model {
  return {
    level: 'code',
    elements,
    relationships: [],
  };
}

describe('computeCommunityOverlay (L4)', () => {
  test('maps a code element to its community via stripped extension', () => {
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/bar.ts', type: 'code', name: 'bar.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        {
          id: 'repoA:packages/foo/src/bar',
          label: 'bar',
          repo: 'repoA',
          package: 'pkg_foo',
          fileType: 'code',
          community: 7,
          communityLabel: 'auth',
          x: 0, y: 0, size: 1,
        },
      ],
      communities: { 7: 'auth' },
      godNodes: [],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');

    expect(result.size).toBe(1);
    const entry = result.get('file::packages/foo/src/bar.ts')!;
    expect(entry.dominantCommunity).toBe(7);
    expect(entry.dominantRatio).toBe(1);
    expect(entry.isGodNode).toBe(false);
    expect(entry.breakdown).toEqual([{ community: 7, count: 1 }]);
  });

  test('marks isGodNode when the matching node is in godNodes', () => {
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/main.tsx', type: 'code', name: 'main.tsx' },
    ]);
    const nodeId = 'repoA:packages/foo/src/main';
    const codeGraph = makeCodeGraph({
      nodes: [
        {
          id: nodeId, label: 'main', repo: 'repoA', package: 'pkg_foo',
          fileType: 'code', community: 3, communityLabel: 'core',
          x: 0, y: 0, size: 5,
        },
      ],
      godNodes: [nodeId],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');

    expect(result.get('file::packages/foo/src/main.tsx')?.isGodNode).toBe(true);
  });

  test('filters by selectedRepo when it matches at least one node.repo', () => {
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/bar.ts', type: 'code', name: 'bar.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      repositories: [
        { id: 'repoA', label: 'RepoA', path: '/repo/a' },
        { id: 'repoB', label: 'RepoB', path: '/repo/b' },
      ],
      nodes: [
        {
          id: 'repoA:packages/foo/src/bar', label: 'bar', repo: 'repoA',
          package: 'foo', fileType: 'code', community: 1,
          communityLabel: 'a', x: 0, y: 0, size: 1,
        },
        {
          id: 'repoB:packages/foo/src/bar', label: 'bar', repo: 'repoB',
          package: 'foo', fileType: 'code', community: 2,
          communityLabel: 'b', x: 0, y: 0, size: 1,
        },
      ],
    });

    expect(computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA')
      .get('file::packages/foo/src/bar.ts')?.dominantCommunity).toBe(1);
    expect(computeCommunityOverlay(c4Model, codeGraph, 4, 'repoB')
      .get('file::packages/foo/src/bar.ts')?.dominantCommunity).toBe(2);
  });

  test('falls back to path-only match when selectedRepo matches no node.repo', () => {
    // 実運用例: C4 側 selectedRepo = path.basename('/anytime-markdown') = 'anytime-markdown'、
    // CodeGraph 側は label ベースで repo.id = 'Workspace'。
    // 両者が異なっても file path 部分でマッチさせて重畳を成立させる。
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/bar.ts', type: 'code', name: 'bar.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      repositories: [{ id: 'Workspace', label: 'Workspace', path: '/anytime-markdown' }],
      nodes: [
        {
          id: 'Workspace:packages/foo/src/bar', label: 'bar', repo: 'Workspace',
          package: 'foo', fileType: 'code', community: 4, communityLabel: 'core',
          x: 0, y: 0, size: 1,
        },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'anytime-markdown');
    expect(result.get('file::packages/foo/src/bar.ts')?.dominantCommunity).toBe(4);
  });

  test('matches across all repositories when selectedRepo is null', () => {
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/bar.ts', type: 'code', name: 'bar.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      repositories: [
        { id: 'repoA', label: 'RepoA', path: '/repo/a' },
        { id: 'repoB', label: 'RepoB', path: '/repo/b' },
      ],
      nodes: [
        {
          id: 'repoB:packages/foo/src/bar', label: 'bar', repo: 'repoB',
          package: 'pkg_foo', fileType: 'code', community: 9,
          communityLabel: 'b', x: 0, y: 0, size: 1,
        },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, null);
    expect(result.get('file::packages/foo/src/bar.ts')?.dominantCommunity).toBe(9);
  });

  test('attaches communitySummary when present', () => {
    const c4Model = makeC4Model([
      { id: 'file::packages/foo/src/bar.ts', type: 'code', name: 'bar.ts' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        {
          id: 'repoA:packages/foo/src/bar', label: 'bar', repo: 'repoA',
          package: 'pkg_foo', fileType: 'code', community: 5,
          communityLabel: 'core', x: 0, y: 0, size: 1,
        },
      ],
      communitySummaries: {
        5: { name: 'Core', summary: '基幹ロジック' },
      },
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.get('file::packages/foo/src/bar.ts')?.communitySummary).toEqual({
      name: 'Core',
      summary: '基幹ロジック',
    });
  });
});

describe('computeCommunityOverlay (L3)', () => {
  test('aggregates descendants and selects the most frequent community', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/comp', type: 'component', name: 'comp' },
      { id: 'file::packages/foo/src/comp/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_foo/comp' },
      { id: 'file::packages/foo/src/comp/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_foo/comp' },
      { id: 'file::packages/foo/src/comp/c.ts', type: 'code', name: 'c.ts', boundaryId: 'pkg_foo/comp' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:packages/foo/src/comp/a', label: 'a', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
        { id: 'repoA:packages/foo/src/comp/b', label: 'b', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
        { id: 'repoA:packages/foo/src/comp/c', label: 'c', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 2, communityLabel: 'Y', x: 0, y: 0, size: 1 },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 3, 'repoA');

    const entry = result.get('pkg_foo/comp')!;
    expect(entry.dominantCommunity).toBe(1);
    expect(entry.dominantRatio).toBeCloseTo(2 / 3);
    expect(entry.breakdown).toEqual([
      { community: 1, count: 2 },
      { community: 2, count: 1 },
    ]);
    expect(entry.isGodNode).toBe(false);
  });

  test('on tie, picks the lower community number for determinism', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/comp', type: 'component', name: 'comp' },
      { id: 'file::packages/foo/src/comp/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_foo/comp' },
      { id: 'file::packages/foo/src/comp/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_foo/comp' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:packages/foo/src/comp/a', label: 'a', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 5, communityLabel: 'X', x: 0, y: 0, size: 1 },
        { id: 'repoA:packages/foo/src/comp/b', label: 'b', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 2, communityLabel: 'Y', x: 0, y: 0, size: 1 },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 3, 'repoA');
    expect(result.get('pkg_foo/comp')?.dominantCommunity).toBe(2);
  });

  test('breakdown is sorted by count desc then community asc', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/comp', type: 'component', name: 'comp' },
      { id: 'file::a.ts', type: 'code', name: 'a', boundaryId: 'pkg_foo/comp' },
      { id: 'file::b.ts', type: 'code', name: 'b', boundaryId: 'pkg_foo/comp' },
      { id: 'file::c.ts', type: 'code', name: 'c', boundaryId: 'pkg_foo/comp' },
      { id: 'file::d.ts', type: 'code', name: 'd', boundaryId: 'pkg_foo/comp' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 7, communityLabel: 'A', x: 0, y: 0, size: 1 },
        { id: 'repoA:b', label: 'b', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 7, communityLabel: 'A', x: 0, y: 0, size: 1 },
        { id: 'repoA:c', label: 'c', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 3, communityLabel: 'C', x: 0, y: 0, size: 1 },
        { id: 'repoA:d', label: 'd', repo: 'repoA', package: 'pkg_foo', fileType: 'code', community: 9, communityLabel: 'B', x: 0, y: 0, size: 1 },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 3, 'repoA');
    expect(result.get('pkg_foo/comp')?.breakdown).toEqual([
      { community: 7, count: 2 },
      { community: 3, count: 1 },
      { community: 9, count: 1 },
    ]);
  });

  test('skips component when no descendant code matches CodeGraph', () => {
    const c4Model = makeC4Model([
      { id: 'pkg_foo/empty', type: 'component', name: 'empty' },
      { id: 'file::packages/foo/src/empty/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_foo/empty' },
    ]);
    const codeGraph = makeCodeGraph({ nodes: [] });

    const result = computeCommunityOverlay(c4Model, codeGraph, 3, 'repoA');
    expect(result.has('pkg_foo/empty')).toBe(false);
  });
});

describe('computeCommunityOverlay (edge cases)', () => {
  test('returns empty map for invalid level (L1/L2)', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
      ],
    });

    expect(computeCommunityOverlay(c4Model, codeGraph, 1 as 3 | 4, 'repoA').size).toBe(0);
    expect(computeCommunityOverlay(c4Model, codeGraph, 2 as 3 | 4, 'repoA').size).toBe(0);
  });

  test('returns empty map when codeGraph has no nodes', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.ts', type: 'code', name: 'a' },
    ]);
    const codeGraph = makeCodeGraph({ nodes: [] });
    expect(computeCommunityOverlay(c4Model, codeGraph, 4, null).size).toBe(0);
  });

  test('handles .tsx and .mdx extensions', () => {
    const c4Model = makeC4Model([
      { id: 'file::a.tsx', type: 'code', name: 'a.tsx' },
      { id: 'file::b.mdx', type: 'code', name: 'b.mdx' },
    ]);
    const codeGraph = makeCodeGraph({
      nodes: [
        { id: 'repoA:a', label: 'a', repo: 'repoA', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'X', x: 0, y: 0, size: 1 },
        { id: 'repoA:b', label: 'b', repo: 'repoA', package: 'pkg', fileType: 'document', community: 2, communityLabel: 'D', x: 0, y: 0, size: 1 },
      ],
    });

    const result = computeCommunityOverlay(c4Model, codeGraph, 4, 'repoA');
    expect(result.get('file::a.tsx')?.dominantCommunity).toBe(1);
    expect(result.get('file::b.mdx')?.dominantCommunity).toBe(2);
  });
});
