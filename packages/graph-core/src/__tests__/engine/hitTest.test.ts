import { hitTest, hitTestNode, hitTestEdge, hitTestResizeHandles, hitTestEdgeSegment } from '../../engine/hitTest';
import { GraphNode, GraphEdge, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE } from '../../types';

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

  it('should detect edge endpoint (from)', () => {
    const edgeWithWp: GraphEdge = {
      id: 'ep1', type: 'connector',
      from: { x: 10, y: 10 }, to: { x: 200, y: 200 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 200 }, { x: 200, y: 200 }],
    };
    const result = hitTest({
      nodes: [], edges: [edgeWithWp],
      wx: 10, wy: 10, scale: 1,
      selectedNodeIds: [], selectedEdgeIds: ['ep1'],
    });
    expect(result.type).toBe('edge-endpoint');
    expect(result.endpointEnd).toBe('from');
  });

  it('should detect edge endpoint (to)', () => {
    const edgeWithWp: GraphEdge = {
      id: 'ep2', type: 'connector',
      from: { x: 10, y: 10 }, to: { x: 200, y: 200 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 200 }, { x: 200, y: 200 }],
    };
    const result = hitTest({
      nodes: [], edges: [edgeWithWp],
      wx: 200, wy: 200, scale: 1,
      selectedNodeIds: [], selectedEdgeIds: ['ep2'],
    });
    expect(result.type).toBe('edge-endpoint');
    expect(result.endpointEnd).toBe('to');
  });

  it('should detect connection point on hover node', () => {
    const node: GraphNode = {
      id: 'cp1', type: 'rect', x: 100, y: 100, width: 200, height: 100,
      text: '', style: DEFAULT_NODE_STYLE,
    };
    // Top connection point is at (200, 100) = x + w/2, y
    const result = hitTest({
      nodes: [node], edges: [],
      wx: 200, wy: 100, scale: 1,
      selectedNodeIds: [], hoverNodeId: 'cp1',
    });
    expect(result.type).toBe('connection-point');
    expect(result.connectionSide).toBe('top');
  });

  it('should detect edge segment in main hitTest', () => {
    const segEdge: GraphEdge = {
      id: 'es1', type: 'connector',
      from: { x: 0, y: 0 }, to: { x: 200, y: 0 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 0 }],
    };
    const result = hitTest({
      nodes: [], edges: [segEdge],
      wx: 100, wy: 50, scale: 1,
      selectedNodeIds: [],
    });
    expect(result.type).toBe('edge-segment');
    expect(result.segmentDirection).toBe('horizontal');
  });

  it('should detect edge endpoint without waypoints', () => {
    const simpleEdge: GraphEdge = {
      id: 'ep3', type: 'line',
      from: { x: 10, y: 10 }, to: { x: 200, y: 200 },
      style: DEFAULT_EDGE_STYLE,
    };
    const result = hitTest({
      nodes: [], edges: [simpleEdge],
      wx: 10, wy: 10, scale: 1,
      selectedNodeIds: [], selectedEdgeIds: ['ep3'],
    });
    expect(result.type).toBe('edge-endpoint');
    expect(result.endpointEnd).toBe('from');
  });

  it('should skip non-existent edge in selectedEdgeIds', () => {
    const result = hitTest({
      nodes: [], edges: [],
      wx: 10, wy: 10, scale: 1,
      selectedNodeIds: [], selectedEdgeIds: ['nonexistent'],
    });
    expect(result.type).toBe('none');
  });

  it('should skip non-existent hover node', () => {
    const result = hitTest({
      nodes: [], edges: [],
      wx: 10, wy: 10, scale: 1,
      selectedNodeIds: [], hoverNodeId: 'nonexistent',
    });
    expect(result.type).toBe('none');
  });
});

describe('hitTestNode - diamond', () => {
  const diamondNode: GraphNode = {
    id: 'd1', type: 'diamond', x: 100, y: 100, width: 100, height: 100,
    text: '', style: DEFAULT_NODE_STYLE,
  };

  it('should detect point at center of diamond', () => {
    expect(hitTestNode(diamondNode, 150, 150)).toBe(true);
  });

  it('should miss point at corner of diamond bounding box', () => {
    expect(hitTestNode(diamondNode, 101, 101)).toBe(false);
  });
});

describe('hitTestNode - parallelogram', () => {
  const paraNode: GraphNode = {
    id: 'p1', type: 'parallelogram', x: 0, y: 0, width: 200, height: 100,
    text: '', style: DEFAULT_NODE_STYLE,
  };

  it('should detect point at center of parallelogram', () => {
    expect(hitTestNode(paraNode, 100, 50)).toBe(true);
  });

  it('should miss point at top-left corner', () => {
    expect(hitTestNode(paraNode, 5, 5)).toBe(false);
  });
});

describe('hitTestEdge with waypoints', () => {
  const waypointEdge: GraphEdge = {
    id: 'we1', type: 'connector',
    from: { x: 0, y: 0 }, to: { x: 100, y: 100 },
    style: DEFAULT_EDGE_STYLE,
    waypoints: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }],
  };

  it('should detect point near waypoint segment', () => {
    expect(hitTestEdge(waypointEdge, 50, 50, 1)).toBe(true);
  });

  it('should miss point far from all segments', () => {
    expect(hitTestEdge(waypointEdge, 80, 20, 1)).toBe(false);
  });
});

describe('hitTestNode - cylinder', () => {
  const cylNode: GraphNode = {
    id: 'cy1', type: 'cylinder', x: 100, y: 100, width: 100, height: 120,
    text: '', style: DEFAULT_NODE_STYLE,
  };

  it('should detect point in top ellipse region', () => {
    // Top ellipse: center at (150, 100 + ellipseH), ellipseH = min(120*0.15, 15) = 15
    // Point at top center area - wy < y + ellipseH = 115
    expect(hitTestNode(cylNode, 150, 108)).toBe(true);
  });

  it('should miss point outside top ellipse', () => {
    // Point outside top ellipse (corner area)
    expect(hitTestNode(cylNode, 101, 101)).toBe(false);
  });

  it('should detect point in bottom ellipse region', () => {
    // Bottom ellipse: wy > y + h - ellipseH = 100 + 120 - 15 = 205
    expect(hitTestNode(cylNode, 150, 215)).toBe(true);
  });

  it('should miss point outside bottom ellipse', () => {
    // Outside bottom right corner
    expect(hitTestNode(cylNode, 199, 219)).toBe(false);
  });

  it('should detect point in body (middle rectangle)', () => {
    // Body: ellipseH < wy - y < h - ellipseH, so 115 < wy < 205
    expect(hitTestNode(cylNode, 150, 160)).toBe(true);
  });

  it('should miss point outside body sides', () => {
    // Outside the left side
    expect(hitTestNode(cylNode, 90, 160)).toBe(false);
  });
});

describe('hitTestEdgeSegment', () => {
  it('should detect vertical middle segment', () => {
    const edge: GraphEdge = {
      id: 'seg1', type: 'connector',
      from: { x: 0, y: 0 }, to: { x: 200, y: 100 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 200, y: 100 }],
    };
    const result = hitTestEdgeSegment(edge, 50, 50, 1);
    expect(result).not.toBeNull();
    expect(result!.segmentDirection).toBe('vertical');
  });

  it('should return null for edge with fewer than 4 waypoints', () => {
    const edge: GraphEdge = {
      id: 'seg2', type: 'line',
      from: { x: 0, y: 0 }, to: { x: 100, y: 100 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    };
    expect(hitTestEdgeSegment(edge, 50, 50, 1)).toBeNull();
  });

  it('should return null when no segment is close enough', () => {
    const edge: GraphEdge = {
      id: 'seg3', type: 'connector',
      from: { x: 0, y: 0 }, to: { x: 200, y: 100 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 200, y: 100 }],
    };
    expect(hitTestEdgeSegment(edge, 150, 50, 1)).toBeNull();
  });

  it('should detect horizontal segment direction', () => {
    const edge: GraphEdge = {
      id: 'seg4', type: 'connector',
      from: { x: 0, y: 0 }, to: { x: 200, y: 0 },
      style: DEFAULT_EDGE_STYLE,
      waypoints: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 0 }],
    };
    const result = hitTestEdgeSegment(edge, 100, 50, 1);
    expect(result).not.toBeNull();
    expect(result!.segmentDirection).toBe('horizontal');
  });
});
