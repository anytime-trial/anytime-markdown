import { describe, expect, test } from '@jest/globals';
import { resolveSelectedElementCommunity } from '../resolveSelectedElementCommunity';
import type { CommunityOverlayEntry } from '../computeCommunityOverlay';
import type { C4Element, C4Model } from '../types';

function makeOverlayEntry(
  elementId: string,
  dominantCommunity: number,
  breakdown: Array<{ community: number; count: number }> = [{ community: dominantCommunity, count: 1 }],
  isGodNode = false,
): CommunityOverlayEntry {
  const total = breakdown.reduce((sum, e) => sum + e.count, 0);
  const dominantCount = breakdown.find(e => e.community === dominantCommunity)?.count ?? 1;
  return {
    elementId,
    dominantCommunity,
    dominantRatio: dominantCount / total,
    breakdown,
    isGodNode,
  };
}

const c4Model: C4Model = {
  level: 'code',
  elements: [
    { id: 'pkg_foo', type: 'container', name: 'foo' } as C4Element,
    { id: 'pkg_foo/comp', type: 'component', name: 'comp', boundaryId: 'pkg_foo' } as C4Element,
    { id: 'file::packages/foo/src/comp/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_foo/comp' } as C4Element,
  ],
  relationships: [],
};

describe('resolveSelectedElementCommunity', () => {
  test('returns L4 entry for code element (regression: C4 popup was empty)', () => {
    const codeEl = c4Model.elements.find(e => e.type === 'code')!;
    const overlayL4 = new Map([
      [codeEl.id, makeOverlayEntry(codeEl.id, 7)],
    ]);
    const result = resolveSelectedElementCommunity({
      element: codeEl,
      c4Model,
      communityOverlayL3: new Map(),
      communityOverlayL4: overlayL4,
    });

    expect(result).not.toBeNull();
    expect(result!.dominantCommunity).toBe(7);
    expect(result!.elementId).toBe(codeEl.id);
  });

  test('returns L3 entry for component element', () => {
    const compEl = c4Model.elements.find(e => e.type === 'component')!;
    const overlayL3 = new Map([
      [compEl.id, makeOverlayEntry(compEl.id, 3, [
        { community: 3, count: 5 },
        { community: 4, count: 2 },
      ])],
    ]);
    const result = resolveSelectedElementCommunity({
      element: compEl,
      c4Model,
      communityOverlayL3: overlayL3,
      communityOverlayL4: null,
    });

    expect(result?.dominantCommunity).toBe(3);
    expect(result?.breakdown).toEqual([
      { community: 3, count: 5 },
      { community: 4, count: 2 },
    ]);
  });

  test('aggregates container community from descendant components in L3', () => {
    const containerEl = c4Model.elements.find(e => e.type === 'container')!;
    const overlayL3 = new Map([
      ['pkg_foo/comp', makeOverlayEntry('pkg_foo/comp', 3, [
        { community: 3, count: 4 },
        { community: 5, count: 1 },
      ])],
    ]);
    const result = resolveSelectedElementCommunity({
      element: containerEl,
      c4Model,
      communityOverlayL3: overlayL3,
      communityOverlayL4: null,
    });

    expect(result?.dominantCommunity).toBe(3);
    expect(result?.breakdown).toEqual([
      { community: 3, count: 4 },
      { community: 5, count: 1 },
    ]);
    expect(result?.dominantRatio).toBeCloseTo(4 / 5);
  });

  test('attaches communitySummary on container aggregation', () => {
    const containerEl = c4Model.elements.find(e => e.type === 'container')!;
    const overlayL3 = new Map([
      ['pkg_foo/comp', makeOverlayEntry('pkg_foo/comp', 9)],
    ]);
    const result = resolveSelectedElementCommunity({
      element: containerEl,
      c4Model,
      communityOverlayL3: overlayL3,
      communityOverlayL4: null,
      communitySummaries: { 9: { name: 'core', summary: '基幹' } },
    });

    expect(result?.communitySummary).toEqual({ name: 'core', summary: '基幹' });
  });

  test('prefers direct L3 hit over L4 hit when both are present', () => {
    const compEl = c4Model.elements.find(e => e.type === 'component')!;
    const overlayL3 = new Map([[compEl.id, makeOverlayEntry(compEl.id, 1)]]);
    const overlayL4 = new Map([[compEl.id, makeOverlayEntry(compEl.id, 99)]]);
    const result = resolveSelectedElementCommunity({
      element: compEl,
      c4Model,
      communityOverlayL3: overlayL3,
      communityOverlayL4: overlayL4,
    });

    expect(result?.dominantCommunity).toBe(1);
  });

  test('returns null for code element when L4 overlay misses', () => {
    const codeEl = c4Model.elements.find(e => e.type === 'code')!;
    const result = resolveSelectedElementCommunity({
      element: codeEl,
      c4Model,
      communityOverlayL3: new Map(),
      communityOverlayL4: new Map(),
    });

    expect(result).toBeNull();
  });

  test('returns null for container when no descendant components match L3', () => {
    const containerEl = c4Model.elements.find(e => e.type === 'container')!;
    const result = resolveSelectedElementCommunity({
      element: containerEl,
      c4Model,
      communityOverlayL3: new Map(),
      communityOverlayL4: null,
    });

    expect(result).toBeNull();
  });

  test('returns null when both overlays are null', () => {
    const compEl = c4Model.elements.find(e => e.type === 'component')!;
    const result = resolveSelectedElementCommunity({
      element: compEl,
      c4Model,
      communityOverlayL3: null,
      communityOverlayL4: null,
    });

    expect(result).toBeNull();
  });
});
