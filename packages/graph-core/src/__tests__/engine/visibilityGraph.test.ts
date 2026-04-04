import {
  buildMarginRects,
  buildVisibilityGraph,
  dijkstraWithBendPenalty,
  isVisible,
  nudgePath,
} from '../../engine/visibilityGraph';
import type { VNode, VEdge } from '../../engine/visibilityGraph';

describe('buildMarginRects', () => {
  it('should expand rects by margin', () => {
    const rects = buildMarginRects(
      [{ x: 100, y: 100, width: 50, height: 50 }],
      20,
    );
    expect(rects).toEqual([{ x: 80, y: 80, width: 90, height: 90 }]);
  });
});

describe('isVisible', () => {
  it('should return true for horizontally aligned visible pair', () => {
    const a = { x: 0, y: 50, id: 0 };
    const b = { x: 200, y: 50, id: 1 };
    expect(isVisible(a, b, [])).toBe(true);
  });

  it('should return true for vertically aligned visible pair', () => {
    const a = { x: 50, y: 0, id: 0 };
    const b = { x: 50, y: 200, id: 1 };
    expect(isVisible(a, b, [])).toBe(true);
  });

  it('should return false for non-aligned pair', () => {
    const a = { x: 0, y: 0, id: 0 };
    const b = { x: 100, y: 50, id: 1 };
    expect(isVisible(a, b, [])).toBe(false);
  });

  it('should return false when obstacle blocks line of sight', () => {
    const a = { x: 0, y: 50, id: 0 };
    const b = { x: 200, y: 50, id: 1 };
    const obstacles = [{ x: 80, y: 30, width: 40, height: 40 }];
    expect(isVisible(a, b, obstacles)).toBe(false);
  });
});

describe('buildVisibilityGraph', () => {
  it('should create edges between visible vertex pairs with no obstacles', () => {
    const nodes = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 0, id: 1 },
    ];
    const graph = buildVisibilityGraph(nodes, []);
    const edge = graph.find(
      (e) =>
        (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0),
    );
    expect(edge).toBeDefined();
    expect(edge!.horizontal).toBe(true);
    expect(edge!.distance).toBe(100);
  });

  it('should not create edges for non-aligned pairs', () => {
    const nodes = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 50, id: 1 },
    ];
    const graph = buildVisibilityGraph(nodes, []);
    expect(graph.length).toBe(0);
  });

  it('should not create edges blocked by obstacle', () => {
    const nodes = [
      { x: 0, y: 50, id: 0 },
      { x: 200, y: 50, id: 1 },
    ];
    const obstacles = [{ x: 80, y: 30, width: 40, height: 40 }];
    const graph = buildVisibilityGraph(nodes, obstacles);
    const edge = graph.find(
      (e) =>
        (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0),
    );
    expect(edge).toBeUndefined();
  });
});

describe('dijkstraWithBendPenalty', () => {
  it('should find shortest path between two directly visible nodes', () => {
    const nodes: VNode[] = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 0, id: 1 },
    ];
    const edges: VEdge[] = [
      { from: 0, to: 1, distance: 100, horizontal: true },
    ];
    const path = dijkstraWithBendPenalty(nodes, edges, 0, 1, 'h', 50);
    expect(path).toEqual([0, 1]);
  });

  it('should prefer path with fewer bends', () => {
    const nodes: VNode[] = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 0, id: 1 },
      { x: 100, y: 100, id: 2 },
      { x: 200, y: 0, id: 3 },
      { x: 0, y: 100, id: 4 },
    ];
    const edges: VEdge[] = [
      { from: 0, to: 1, distance: 100, horizontal: true },
      { from: 1, to: 2, distance: 100, horizontal: false },
      { from: 0, to: 3, distance: 200, horizontal: true },
      { from: 3, to: 2, distance: 100, horizontal: false },
      { from: 0, to: 4, distance: 100, horizontal: false },
      { from: 4, to: 2, distance: 100, horizontal: true },
    ];
    const path = dijkstraWithBendPenalty(nodes, edges, 0, 2, 'h', 50);
    // 0->1->2 (cost 100+100+50=250) is shortest
    expect(path).toEqual([0, 1, 2]);
  });

  it('should return null when no path exists', () => {
    const nodes: VNode[] = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 100, id: 1 },
    ];
    const path = dijkstraWithBendPenalty(nodes, [], 0, 1, 'h', 50);
    expect(path).toBeNull();
  });
});

describe('nudgePath', () => {
  it('should center a vertical segment between obstacles', () => {
    // A(0,0)->（100,0)->(100,200)->(200,200)
    // Vertical segment x=100 is between left constraint x=50 and right constraint x=150
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const obstacles = [
      { x: 30, y: 50, width: 20, height: 100 }, // right edge at x=50
      { x: 150, y: 50, width: 20, height: 100 }, // left edge at x=150
    ];
    const result = nudgePath(path, obstacles);
    // Center: (50 + 150) / 2 = 100 -> no change
    expect(result[1].x).toBe(100);
    expect(result[2].x).toBe(100);
  });

  it('should shift a vertical segment to center of available space', () => {
    // A(0,0)->(20,0)->(20,200)->(300,200)
    // Vertical segment x=20 is near left edge. Should center between endpoints.
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 200 },
      { x: 300, y: 200 },
    ];
    const obstacles: { x: number; y: number; width: number; height: number }[] = [];
    const result = nudgePath(path, obstacles);
    // No obstacles: range [0, 300], center = 150
    expect(result[1].x).toBe(150);
    expect(result[2].x).toBe(150);
  });

  it('should not mutate the input path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 200 },
      { x: 300, y: 200 },
    ];
    nudgePath(path, []);
    expect(path[1].x).toBe(20);
  });

  it('should return the path unchanged for fewer than 4 points', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = nudgePath(path, []);
    expect(result).toEqual(path);
  });
});
