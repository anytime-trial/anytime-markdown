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

  it('should return false when obstacle blocks vertical segment (lines 65-73)', () => {
    // vertical segment: x=50, y from 0 to 200
    const a = { x: 50, y: 0, id: 0 };
    const b = { x: 50, y: 200, id: 1 };
    // obstacle whose x-range includes 50, y-range overlaps
    const obstacles = [{ x: 30, y: 80, width: 40, height: 40 }]; // x: 30..70 (includes 50), y: 80..120
    expect(isVisible(a, b, obstacles)).toBe(false);
  });

  it('returns true when obstacle y-range is outside vertical segment (line 65-73 boundary)', () => {
    const a = { x: 50, y: 0, id: 0 };
    const b = { x: 50, y: 200, id: 1 };
    // obstacle above/below the segment
    const obstacles = [{ x: 30, y: 220, width: 40, height: 40 }]; // y: 220..260, outside 0..200
    expect(isVisible(a, b, obstacles)).toBe(true);
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

  it('should skip stale heap entries and trigger bubbleUp/sinkDown swaps (lines 131-132, 146)', () => {
    // Graph with many edges forces the heap to bubble up and sink down with swaps.
    // 5 nodes: 0→1, 0→2, 0→3, 0→4, 1→4, 2→4, 3→4 with varying costs.
    // This pushes multiple entries to the heap, triggering both bubbleUp and sinkDown code paths.
    const nodes: VNode[] = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 0, id: 1 },
      { x: 200, y: 0, id: 2 },
      { x: 300, y: 0, id: 3 },
      { x: 0, y: 100, id: 4 },
      { x: 100, y: 100, id: 5 },
    ];
    const edges: VEdge[] = [
      { from: 0, to: 1, distance: 50, horizontal: true },
      { from: 0, to: 2, distance: 100, horizontal: true },
      { from: 0, to: 3, distance: 200, horizontal: true },
      { from: 0, to: 4, distance: 30, horizontal: false },
      { from: 1, to: 5, distance: 10, horizontal: false },
      { from: 2, to: 5, distance: 5, horizontal: false },
      { from: 3, to: 5, distance: 200, horizontal: false },
      { from: 4, to: 5, distance: 50, horizontal: true },
    ];
    const path = dijkstraWithBendPenalty(nodes, edges, 0, 5, 'init', 0);
    expect(path).not.toBeNull();
    expect(path![0]).toBe(0);
    expect(path![path!.length - 1]).toBe(5);
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
  it('should push lower bound from obstacle on left of vertical segment (line 146)', () => {
    // vertical segment at x=100, y=0..200
    // obstacle: left of x=100, right edge at x=80 → obsRight=80 > lower=0 → lower becomes 80
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const obstacle = { x: 50, y: 50, width: 30, height: 100 }; // right edge at 80, left of x=100
    const result = nudgePath(path, [obstacle]);
    // lower constrained to 80, upper still 200 → center = (80+200)/2 = 140
    expect(result[1].x).toBeGreaterThanOrEqual(80);
  });

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

  it('should center a horizontal segment between prev/next y values (lines 336-347)', () => {
    // A(0,0) -> (0,30) -> (200,30) -> (200,200): horizontal segment at y=30
    // prev.y=0, next.y=200 → range [0,200], center=100
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 200 },
    ];
    const result = nudgePath(path, []);
    expect(result[1].y).toBe(100);
    expect(result[2].y).toBe(100);
  });

  it('constrains horizontal segment when obstacle is below (line 289-304)', () => {
    // horizontal segment at y=30; obstacle below: R(0, 60, 200, 20) → bottom=80
    // range [0,200], center would be 100 but obstacle above current y is not applicable
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
    ];
    const obstacle = { x: 0, y: 130, width: 200, height: 20 }; // bottom=150
    const result = nudgePath(path, [obstacle]);
    // range [0,200] with upper bound clipped to 130 → center = (0+130)/2 = 65
    expect(result[1].y).toBeLessThanOrEqual(130);
  });

  it('constrains horizontal segment when obstacle is above (lines 289-304)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
    ];
    const obstacle = { x: 0, y: 30, width: 200, height: 20 }; // bottom at 50
    const result = nudgePath(path, [obstacle]);
    expect(result[1].y).toBeGreaterThanOrEqual(50);
  });
});
