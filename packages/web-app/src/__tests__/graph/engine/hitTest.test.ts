import { hitTest, hitTestNode, hitTestEdge, hitTestResizeHandles } from '@anytime-markdown/graph-core/engine';
import { GraphNode, GraphEdge, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE } from '@anytime-markdown/graph-viewer/src/types';

const rectNode: GraphNode = {
  id: 'r1', type: 'rect', x: 100, y: 100, width: 200, height: 100,
  text: '', style: DEFAULT_NODE_STYLE,
};

const ellipseNode: GraphNode = {
  id: 'e1', type: 'ellipse', x: 400, y: 100, width: 200, height: 100,
  text: '', style: DEFAULT_NODE_STYLE,
};

const edge: GraphEdge = {
  id: 'ed1', type: 'line', from: { x: 100, y: 100 }, to: { x: 300, y: 300 },
  style: DEFAULT_EDGE_STYLE,
};

describe('hitTestNode', () => {
  it('should detect point inside rect', () => {
    expect(hitTestNode(rectNode, 150, 150)).toBe(true);
  });
  it('should miss point outside rect', () => {
    expect(hitTestNode(rectNode, 50, 50)).toBe(false);
  });
  it('should detect point inside ellipse', () => {
    expect(hitTestNode(ellipseNode, 500, 150)).toBe(true);
  });
  it('should miss point at ellipse corner', () => {
    expect(hitTestNode(ellipseNode, 401, 101)).toBe(false);
  });
});

describe('hitTestEdge', () => {
  it('should detect point near line', () => {
    expect(hitTestEdge(edge, 200, 200, 1)).toBe(true);
  });
  it('should miss point far from line', () => {
    expect(hitTestEdge(edge, 100, 300, 1)).toBe(false);
  });
});

describe('hitTestResizeHandles', () => {
  it('should detect NW handle', () => {
    expect(hitTestResizeHandles(rectNode, 100, 100, 1)).toBe('nw');
  });
  it('should detect SE handle', () => {
    expect(hitTestResizeHandles(rectNode, 300, 200, 1)).toBe('se');
  });
  it('should return null for center', () => {
    expect(hitTestResizeHandles(rectNode, 200, 150, 1)).toBeNull();
  });
});

describe('hitTest', () => {
  it('should prioritize resize handle over node', () => {
    const result = hitTest({ nodes: [rectNode], edges: [], wx: 100, wy: 100, scale: 1, selectedNodeIds: ['r1'] });
    expect(result.type).toBe('resize-handle');
  });
  it('should return last node (frontmost)', () => {
    const node2: GraphNode = { ...rectNode, id: 'r2', x: 150, y: 120 };
    const result = hitTest({ nodes: [rectNode, node2], edges: [], wx: 200, wy: 150, scale: 1, selectedNodeIds: [] });
    expect(result.id).toBe('r2');
  });
  it('should return none for empty area', () => {
    const result = hitTest({ nodes: [rectNode], edges: [edge], wx: 0, wy: 0, scale: 1, selectedNodeIds: [] });
    expect(result.type).toBe('none');
  });
});
