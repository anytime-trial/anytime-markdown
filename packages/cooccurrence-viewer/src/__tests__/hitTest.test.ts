import type { RenderGraph, RenderNode } from '../types';
import { hitTestNode } from '../viewport/hitTest';

function node(index: number, x: number): RenderNode {
  return {
    index,
    label: `node-${index}`,
    frequency: 1,
    clusterIndex: undefined,
    x,
    y: 0,
    radius: 10,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
    labelFontSize: 12,
    cooccurrenceCount: 0,
    isSubject: false,
  };
}

describe('hitTestNode', () => {
  it('finds a node from screen coordinates through the viewport', () => {
    const graph: RenderGraph = { nodes: [node(0, 10)], links: [] };
    expect(hitTestNode(graph, 30, 0, { scale: 2, offsetX: 10, offsetY: 0 })?.index).toBe(0);
  });

  it('returns null outside every circle', () => {
    const graph: RenderGraph = { nodes: [node(0, 10)], links: [] };
    expect(hitTestNode(graph, 100, 0, { scale: 1, offsetX: 0, offsetY: 0 })).toBeNull();
  });
});
