import { computeAvoidancePath } from '../../engine/pathfinding';

describe('computeAvoidancePath', () => {
  it('should return a direct orthogonal path with no obstacles', () => {
    const path = computeAvoidancePath(
      { x: 0, y: 50 }, 'right',
      { x: 300, y: 50 }, 'left',
      [],
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path[path.length - 1]).toEqual({ x: 300, y: 50 });
  });

  it('should route around a blocking obstacle', () => {
    const path = computeAvoidancePath(
      { x: 0, y: 50 }, 'right',
      { x: 300, y: 50 }, 'left',
      [{ x: 100, y: 0, width: 100, height: 100 }],
      20,
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path[path.length - 1]).toEqual({ x: 300, y: 50 });
    // Path should not pass through the obstacle
    for (const pt of path) {
      const inside = pt.x > 100 && pt.x < 200 && pt.y > 0 && pt.y < 100;
      expect(inside).toBe(false);
    }
  });

  it('should simplify redundant waypoints into straight segments', () => {
    const path = computeAvoidancePath(
      { x: 0, y: 0 }, 'right',
      { x: 200, y: 0 }, 'left',
      [],
      20,
    );
    // A straight horizontal path should have 2-4 points max
    expect(path.length).toBeLessThanOrEqual(4);
  });

  it('should handle vertical routing', () => {
    const path = computeAvoidancePath(
      { x: 50, y: 0 }, 'bottom',
      { x: 50, y: 300 }, 'top',
      [{ x: 0, y: 100, width: 100, height: 100 }],
      20,
    );
    expect(path[0]).toEqual({ x: 50, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 50, y: 300 });
    for (const pt of path) {
      const inside = pt.x > 0 && pt.x < 100 && pt.y > 100 && pt.y < 200;
      expect(inside).toBe(false);
    }
  });

  it('should collapse staircase pattern into L-shape when no obstacle blocks', () => {
    // Diagonal routing with no blocking obstacle should not produce staircase
    const path = computeAvoidancePath(
      { x: 0, y: 0 }, 'right',
      { x: 300, y: 200 }, 'left',
      [{ x: 500, y: 500, width: 50, height: 50 }], // far away obstacle
      20,
    );
    // Should be at most 4 points (start, bend, end or start, bend1, bend2, end)
    expect(path.length).toBeLessThanOrEqual(4);
    // Should not have staircase pattern (>4 waypoints with alternating directions)
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 300, y: 200 });
  });

  it('should keep detour when obstacle blocks L-shape path', () => {
    // Obstacle sits right between start and end, blocking direct L-shape
    const path = computeAvoidancePath(
      { x: 0, y: 0 }, 'right',
      { x: 300, y: 200 }, 'left',
      [{ x: 100, y: 50, width: 100, height: 100 }],
      20,
    );
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 300, y: 200 });
    // Should route around the obstacle
    for (const pt of path) {
      const inside = pt.x > 100 && pt.x < 200 && pt.y > 50 && pt.y < 150;
      expect(inside).toBe(false);
    }
  });

  it('should align connection point with first segment (no diagonal at endpoints)', () => {
    // Connection point at center of right edge (y=25) should produce
    // a horizontal first segment, not diagonal to a grid-snapped point
    const path = computeAvoidancePath(
      { x: 150, y: 25 }, 'right',  // center of right edge of small node
      { x: 700, y: 90 }, 'left',   // center of left edge of large node
      [{ x: 400, y: 200, width: 80, height: 60 }], // obstacle below
      20,
    );
    // First segment should be horizontal (same y as start)
    expect(path[1].y).toBe(path[0].y);
    // Last segment should be horizontal (same y as end)
    expect(path[path.length - 2].y).toBe(path[path.length - 1].y);
  });

  it('should produce only orthogonal segments (no diagonal lines)', () => {
    const path = computeAvoidancePath(
      { x: 0, y: 0 }, 'right',
      { x: 400, y: 300 }, 'left',
      [{ x: 150, y: 100, width: 100, height: 100 }],
      20,
    );
    // Every consecutive pair should be either horizontal or vertical
    for (let i = 0; i < path.length - 1; i++) {
      const curr = path[i];
      const next = path[i + 1];
      const isHorizontal = curr.y === next.y;
      const isVertical = curr.x === next.x;
      expect(isHorizontal || isVertical).toBe(true);
    }
  });
});
