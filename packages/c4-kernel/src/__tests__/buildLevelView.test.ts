import { buildLevelView, getFrameDepth } from '../view/buildLevelView';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core';

const BASE_STYLE = { fill: '#fff', stroke: '#000', strokeWidth: 1, fontSize: 12, fontFamily: 'sans-serif' };

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    id: 'test', name: 'test', nodes, edges: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: 0, updatedAt: 0,
  };
}

function makeFrame(id: string, groupId?: string): GraphNode {
  return {
    id, type: 'frame', x: 0, y: 0, width: 400, height: 300,
    text: id, style: { ...BASE_STYLE },
    ...(groupId ? { groupId } : {}),
  };
}

function makeRect(id: string, groupId?: string): GraphNode {
  return {
    id, type: 'rect', x: 0, y: 0, width: 160, height: 60,
    text: id, style: { ...BASE_STYLE },
    ...(groupId ? { groupId } : {}),
  };
}

describe('getFrameDepth', () => {
  it('should return 1 for root frame', () => {
    const nodes = [makeFrame('f1')];
    expect(getFrameDepth(nodes[0], nodes)).toBe(1);
  });

  it('should return 2 for nested frame', () => {
    const nodes = [makeFrame('f1'), makeFrame('f2', 'f1')];
    expect(getFrameDepth(nodes[1], nodes)).toBe(2);
  });

  it('should return 3 for double-nested frame', () => {
    const nodes = [makeFrame('f1'), makeFrame('f2', 'f1'), makeFrame('f3', 'f2')];
    expect(getFrameDepth(nodes[2], nodes)).toBe(3);
  });
});

describe('buildLevelView', () => {
  it('should return all nodes at L4', () => {
    const doc = makeDoc([makeFrame('l2'), makeFrame('l3', 'l2'), makeRect('leaf', 'l3')]);
    const view = buildLevelView(doc, 4);
    expect(view.nodes).toHaveLength(3);
  });

  it('should hide L4 nodes and convert L3 frames to rect at L3', () => {
    const doc = makeDoc([makeFrame('l2'), makeFrame('l3', 'l2'), makeRect('leaf', 'l3')]);
    const view = buildLevelView(doc, 3);
    expect(view.nodes.find(n => n.id === 'leaf')).toBeUndefined();
    const l3 = view.nodes.find(n => n.id === 'l3');
    expect(l3?.type).toBe('rect');
    const l2 = view.nodes.find(n => n.id === 'l2');
    expect(l2?.type).toBe('frame');
  });

  it('should show only L2 frames as rect at L2', () => {
    const doc = makeDoc([makeFrame('l2'), makeFrame('l3', 'l2'), makeRect('leaf', 'l3')]);
    const view = buildLevelView(doc, 2);
    expect(view.nodes).toHaveLength(1);
    expect(view.nodes[0].type).toBe('rect');
    expect(view.nodes[0].id).toBe('l2');
  });

  it('should not mutate original document', () => {
    const doc = makeDoc([makeFrame('l2'), makeFrame('l3', 'l2')]);
    buildLevelView(doc, 3);
    expect(doc.nodes[1].type).toBe('frame');
  });
});
