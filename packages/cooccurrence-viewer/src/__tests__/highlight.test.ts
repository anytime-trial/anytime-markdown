import type { RenderGraph, RenderNode } from '../types';
import { computeNeighborhoodHighlight } from '../render/highlight';

const renderNode = (index: number): RenderNode => ({
  index,
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
});

describe('computeNeighborhoodHighlight', () => {
  it('returns selected node, direct neighbors, and incident links only', () => {
    const graph: RenderGraph = {
      nodes: [renderNode(0), renderNode(1), renderNode(2), renderNode(3)],
      links: [
        { index: 0, source: 0, target: 1, strength: 1, width: 1 },
        { index: 1, source: 1, target: 2, strength: 1, width: 1 },
        { index: 2, source: 3, target: 0, strength: 1, width: 1 },
      ],
    };
    const result = computeNeighborhoodHighlight(graph, 0);
    expect([...result?.nodeIndexes ?? []].sort()).toEqual([0, 1, 3]);
    expect([...result?.linkIndexes ?? []].sort()).toEqual([0, 2]);
  });
});
