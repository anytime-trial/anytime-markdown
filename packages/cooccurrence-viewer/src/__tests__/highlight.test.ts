import { LINK_DIRECTION } from '@anytime-markdown/graph-core';
import type { RenderGraph, RenderNode } from '../types';
import { computeNeighborhoodHighlight, isNodeLit, timeLinkLit } from '../render/highlight';

const renderNode = (index: number, layer = 0): RenderNode => ({
  index,
  layer,
  label: String(index),
  frequency: 1,
  clusterIndex: undefined,
  x: 0,
  y: 0,
  radius: 10,
  fill: '#fff',
  stroke: '#000',
  strokeWidth: 2,
  labelFontSize: 12,
  cooccurrenceCount: 0,
  isSubject: false,
  hasNote: false,
});

describe('computeNeighborhoodHighlight', () => {
  it('returns selected node, direct neighbors, and incident links only', () => {
    const graph: RenderGraph = {
      nodes: [renderNode(0), renderNode(1), renderNode(2), renderNode(3)],
      links: [
        { index: 0, layer: 0, source: 0, target: 1, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
        { index: 1, layer: 0, source: 1, target: 2, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
        { index: 2, layer: 0, source: 3, target: 0, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
      ],
      timeLinks: [],
      layers: [], clusterLanes: [],
    };
    const result = computeNeighborhoodHighlight(graph, 0);
    expect([0, 1, 2, 3].filter((i) => isNodeLit(result, i, 0))).toEqual([0, 1, 3]);
    expect([...result?.linkIndexes ?? []].sort()).toEqual([0, 2]);
  });

  it('lights every node of a single view (layer 0) as before', () => {
    const graph: RenderGraph = {
      nodes: [renderNode(0), renderNode(1)],
      links: [
        { index: 0, layer: 0, source: 0, target: 1, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
      ],
      timeLinks: [],
      layers: [], clusterLanes: [],
    };
    const result = computeNeighborhoodHighlight(graph, 0);
    expect(isNodeLit(result, 0, 0)).toBe(true);
    expect(isNodeLit(result, 1, 0)).toBe(true);
  });

  describe('layered view', () => {
    // 選択語 0 は層 0〜2 に存在。近傍 1 は層 0〜2 に存在するが、0 との共起は層 0 にしか無い。
    // 語 2 は層 1 で語 1 とだけ共起する（選択語の近傍ではない）。
    const graph: RenderGraph = {
      nodes: [
        renderNode(0, 0), renderNode(0, 1), renderNode(0, 2),
        renderNode(1, 0), renderNode(1, 1), renderNode(1, 2),
        renderNode(2, 1),
      ],
      links: [
        { index: 0, layer: 0, source: 0, target: 1, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
        { index: 1, layer: 1, source: 1, target: 2, strength: 1, width: 1, direction: LINK_DIRECTION.none, hasNote: false },
      ],
      timeLinks: [],
      layers: [], clusterLanes: [],
    };
    const result = computeNeighborhoodHighlight(graph, 0);

    it('lights the selected node on every layer it exists on', () => {
      expect(isNodeLit(result, 0, 0)).toBe(true);
      expect(isNodeLit(result, 0, 1)).toBe(true);
      expect(isNodeLit(result, 0, 2)).toBe(true);
    });

    it('lights a neighbor only on layers where a link to the selection is drawn', () => {
      expect(isNodeLit(result, 1, 0)).toBe(true);
      expect(isNodeLit(result, 1, 1)).toBe(false);
      expect(isNodeLit(result, 1, 2)).toBe(false);
    });

    it('keeps non-neighbors dim on every layer', () => {
      expect(isNodeLit(result, 2, 1)).toBe(false);
    });

    it('keeps incident links regardless of layer', () => {
      expect([...result?.linkIndexes ?? []].sort()).toEqual([0]);
    });

    describe('timeLinkLit（レイヤー間の点線）', () => {
      it('lights the dashed line only when both end layers are lit', () => {
        // 選択語 0 の点線は全レイヤー点灯なので常に明るい。
        expect(timeLinkLit(result, { nodeIndex: 0, fromLayer: 0, toLayer: 1 })).toBe(true);
        expect(timeLinkLit(result, { nodeIndex: 0, fromLayer: 1, toLayer: 2 })).toBe(true);
        // 近傍 1 は層 0 だけ点灯。層 0→1 の点線は片端が淡いため淡くする。
        expect(timeLinkLit(result, { nodeIndex: 1, fromLayer: 0, toLayer: 1 })).toBe(false);
        expect(timeLinkLit(result, { nodeIndex: 1, fromLayer: 1, toLayer: 2 })).toBe(false);
      });

      it('lights everything when nothing is selected', () => {
        expect(timeLinkLit(null, { nodeIndex: 1, fromLayer: 0, toLayer: 1 })).toBe(true);
      });
    });
  });
});
