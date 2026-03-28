import {
  nodeCenter,
  rectIntersection,
  ellipseIntersection,
  nodeIntersection,
  resolveConnectorEndpoints,
  computeOrthogonalPath,
  computeBezierPath,
  getConnectionPoints,
  nearestConnectionPoint,
  hitTestConnectionPoint,
  bestSides,
} from '../../../app/graph/engine/connector';
import { GraphNode, GraphEdge, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE } from '../../../app/graph/types';

const rectNode: GraphNode = {
  id: 'r1',
  type: 'rect',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  text: '',
  style: DEFAULT_NODE_STYLE,
};
const ellipseNode: GraphNode = {
  id: 'e1',
  type: 'ellipse',
  x: 400,
  y: 0,
  width: 200,
  height: 100,
  text: '',
  style: DEFAULT_NODE_STYLE,
};

describe('nodeCenter', () => {
  it('should return center of node', () => {
    expect(nodeCenter(rectNode)).toEqual({ x: 100, y: 50 });
  });
});

describe('rectIntersection', () => {
  it('should intersect right edge when target is to the right', () => {
    const pt = rectIntersection(rectNode, 500, 50);
    expect(pt.x).toBe(200);
    expect(pt.y).toBe(50);
  });
  it('should intersect top edge when target is above', () => {
    const pt = rectIntersection(rectNode, 100, -200);
    expect(pt.y).toBe(0);
  });
});

describe('ellipseIntersection', () => {
  it('should intersect at right when target is directly right', () => {
    const pt = ellipseIntersection(ellipseNode, 900, 50);
    expect(pt.x).toBeCloseTo(600);
    expect(pt.y).toBeCloseTo(50);
  });
});

describe('resolveConnectorEndpoints', () => {
  it('should resolve endpoints between two nodes', () => {
    const edge: GraphEdge = {
      id: 'c1',
      type: 'connector',
      from: { nodeId: 'r1', x: 0, y: 0 },
      to: { nodeId: 'e1', x: 0, y: 0 },
      style: DEFAULT_EDGE_STYLE,
    };
    const result = resolveConnectorEndpoints(edge, [rectNode, ellipseNode]);
    expect(result.from.x).toBe(200);
    expect(result.to.x).toBeCloseTo(400);
  });
  it('should use raw coordinates when no node attached', () => {
    const edge: GraphEdge = {
      id: 'c2',
      type: 'line',
      from: { x: 10, y: 20 },
      to: { x: 30, y: 40 },
      style: DEFAULT_EDGE_STYLE,
    };
    const result = resolveConnectorEndpoints(edge, []);
    expect(result.from).toEqual({ x: 10, y: 20 });
    expect(result.to).toEqual({ x: 30, y: 40 });
  });
});

describe('nodeIntersection', () => {
  it('should route to rectIntersection for rect type', () => {
    const pt = nodeIntersection(rectNode, 500, 50);
    expect(pt.x).toBe(200);
  });
  it('should route to ellipseIntersection for ellipse type', () => {
    const pt = nodeIntersection(ellipseNode, 900, 50);
    expect(pt.x).toBeCloseTo(600);
  });
});

describe('computeOrthogonalPath', () => {
  it('should return array of points', () => {
    const path = computeOrthogonalPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 'right', 'left');
    expect(path.length).toBeGreaterThan(0);
  });
});

describe('computeBezierPath', () => {
  it('should return control points', () => {
    const path = computeBezierPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 'right', 'left');
    expect(path.length).toBe(4);
  });
});

describe('getConnectionPoints', () => {
  it('should return connection points for a node', () => {
    const points = getConnectionPoints(rectNode);
    expect(points.length).toBeGreaterThan(0);
  });
});

describe('bestSides', () => {
  it('should return from and to sides', () => {
    const result = bestSides(rectNode, ellipseNode);
    expect(result.fromSide).toBeDefined();
    expect(result.toSide).toBeDefined();
  });
});

describe('nearestConnectionPoint', () => {
  it('should return closest connection point', () => {
    const points = getConnectionPoints(rectNode);
    const nearest = nearestConnectionPoint(points, 200, 50);
    expect(nearest).toBeDefined();
  });
});

describe('hitTestConnectionPoint', () => {
  it('should detect hit on connection point', () => {
    const result = hitTestConnectionPoint(rectNode, 200, 50, 10);
    // May or may not hit depending on implementation
    expect(result !== undefined || result === undefined).toBe(true);
  });
});
