import {
  getVisibleBounds,
  isNodeVisible,
  isEdgeVisible,
  type VisibleBounds,
} from '../../engine/culling';
import type { GraphNode, GraphEdge, Viewport } from '../../types';

function vp(scale = 1, offsetX = 0, offsetY = 0): Viewport {
  return { scale, offsetX, offsetY };
}

function node(x: number, y: number, w = 100, h = 50): GraphNode {
  return {
    id: 'n',
    x,
    y,
    width: w,
    height: h,
    label: '',
    shape: 'rectangle',
    style: { fill: '#fff', stroke: '#000', borderRadius: 4 },
  } as unknown as GraphNode;
}

function edge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  waypoints?: { x: number; y: number }[],
): GraphEdge {
  return { id: 'e', from, to, waypoints, label: '' } as unknown as GraphEdge;
}

describe('getVisibleBounds', () => {
  test('zero offset and scale 1 gives bounds = [-margin, canvas+margin]', () => {
    const b = getVisibleBounds(vp(), 800, 600, 10);
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 810, maxY: 610 });
  });

  test('positive offset shrinks the visible world-space window leftward', () => {
    const b = getVisibleBounds(vp(1, 100, 50), 800, 600, 0);
    expect(b).toEqual({ minX: -100, minY: -50, maxX: 700, maxY: 550 });
  });

  test('scale 2 halves world-space window size', () => {
    const b = getVisibleBounds(vp(2, 0, 0), 800, 600, 0);
    // toBe は Object.is で -0 / 0 を区別するため +0 を加えて正規化する
    expect(b.minX + 0).toBe(0);
    expect(b.minY + 0).toBe(0);
    expect(b.maxX).toBe(400);
    expect(b.maxY).toBe(300);
  });

  test('default margin is 50 when omitted', () => {
    const b = getVisibleBounds(vp(), 100, 100);
    expect(b.minX).toBe(-50);
    expect(b.maxX).toBe(150);
  });
});

describe('isNodeVisible', () => {
  const bounds: VisibleBounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };

  test('node fully inside bounds is visible', () => {
    expect(isNodeVisible(node(50, 50, 100, 50), bounds)).toBe(true);
  });

  test('node touching bounds at the right edge is not visible (strict)', () => {
    // node.x = 200 (== maxX), node.x + width > minX (200 > 0) true,
    // node.x (200) < maxX (200) is false → not visible
    expect(isNodeVisible(node(200, 50, 100, 50), bounds)).toBe(false);
  });

  test('node overlapping bounds partially is visible', () => {
    expect(isNodeVisible(node(-50, -25, 100, 50), bounds)).toBe(true);
  });

  test('node entirely outside bounds is not visible', () => {
    expect(isNodeVisible(node(300, 300, 100, 50), bounds)).toBe(false);
  });
});

describe('isEdgeVisible', () => {
  const bounds: VisibleBounds = { minX: 0, minY: 0, maxX: 200, maxY: 200 };

  test('edge endpoints inside bounds is visible', () => {
    expect(isEdgeVisible(edge({ x: 50, y: 50 }, { x: 150, y: 150 }), bounds)).toBe(true);
  });

  test('edge entirely outside bounds is not visible', () => {
    expect(isEdgeVisible(edge({ x: 300, y: 300 }, { x: 400, y: 400 }), bounds)).toBe(false);
  });

  test('edge bounding box overlapping bounds is visible even if both endpoints outside', () => {
    // edge crosses from top-left outside to bottom-right outside, passes through bounds
    expect(isEdgeVisible(edge({ x: -10, y: -10 }, { x: 210, y: 210 }), bounds)).toBe(true);
  });

  test('waypoints are considered in bounding box', () => {
    const e = edge({ x: -300, y: -300 }, { x: -100, y: -100 }, [{ x: 100, y: 100 }]);
    expect(isEdgeVisible(e, bounds)).toBe(true);
  });
});
