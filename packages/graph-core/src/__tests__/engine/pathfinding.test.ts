import { computeVisibilityPath } from '../../engine/visibilityGraph';

describe('computeVisibilityPath', () => {
  it('should return a direct orthogonal path with no obstacles', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 50 }, 'right',
      { x: 300, y: 50 }, 'left',
      [],
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path.at(-1)).toEqual({ x: 300, y: 50 });
  });

  it('should route around a blocking obstacle', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 50 }, 'right',
      { x: 300, y: 50 }, 'left',
      [{ x: 100, y: 0, width: 100, height: 100 }],
      20,
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path.at(-1)).toEqual({ x: 300, y: 50 });
    // Path should not pass through the obstacle
    for (const pt of path) {
      const inside = pt.x > 100 && pt.x < 200 && pt.y > 0 && pt.y < 100;
      expect(inside).toBe(false);
    }
  });

  it('should simplify redundant waypoints into straight segments', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 0 }, 'right',
      { x: 200, y: 0 }, 'left',
      [],
      20,
    );
    // A straight horizontal path should have few points
    expect(path.length).toBeLessThanOrEqual(4);
  });

  it('should handle vertical routing', () => {
    const path = computeVisibilityPath(
      { x: 50, y: 0 }, 'bottom',
      { x: 50, y: 300 }, 'top',
      [{ x: 0, y: 100, width: 100, height: 100 }],
      20,
    );
    expect(path[0]).toEqual({ x: 50, y: 0 });
    expect(path.at(-1)).toEqual({ x: 50, y: 300 });
    for (const pt of path) {
      const inside = pt.x > 0 && pt.x < 100 && pt.y > 100 && pt.y < 200;
      expect(inside).toBe(false);
    }
  });

  it('should collapse staircase pattern into L-shape when no obstacle blocks', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 0 }, 'right',
      { x: 300, y: 200 }, 'left',
      [{ x: 500, y: 500, width: 50, height: 50 }], // far away obstacle
      20,
    );
    // Should be compact (not a staircase with many points)
    expect(path.length).toBeLessThanOrEqual(8);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 300, y: 200 });
  });

  it('should keep detour when obstacle blocks L-shape path', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 0 }, 'right',
      { x: 300, y: 200 }, 'left',
      [{ x: 100, y: 50, width: 100, height: 100 }],
      20,
    );
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 300, y: 200 });
    // Should route around the obstacle
    for (const pt of path) {
      const inside = pt.x > 100 && pt.x < 200 && pt.y > 50 && pt.y < 150;
      expect(inside).toBe(false);
    }
  });

  it('should ensure perpendicular exit/entry at node edges', () => {
    const path = computeVisibilityPath(
      { x: 150, y: 25 }, 'right',
      { x: 700, y: 90 }, 'left',
      [{ x: 400, y: 200, width: 80, height: 60 }],
      20,
    );
    // First segment: horizontal (same y as start)
    expect(path[1].y).toBe(path[0].y);
    // Last segment: horizontal (same y as end)
    expect(path.at(-2)!.y).toBe(path.at(-1)!.y);
  });

  it('should ensure perpendicular exit/entry for vertical sides', () => {
    const path = computeVisibilityPath(
      { x: 100, y: 80 }, 'bottom',
      { x: 300, y: 250 }, 'top',
      [{ x: 180, y: 120, width: 60, height: 60 }],
      20,
    );
    // First segment: vertical (same x as start)
    expect(path[1].x).toBe(path[0].x);
    // Last segment: vertical (same x as end)
    expect(path.at(-2)!.x).toBe(path.at(-1)!.x);
  });

  it('should produce only orthogonal segments (no diagonal lines)', () => {
    const path = computeVisibilityPath(
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

  it('should handle direct path with vertical start and vertical end sides', () => {
    const path = computeVisibilityPath(
      { x: 50, y: 0 }, 'bottom',
      { x: 150, y: 300 }, 'top',
      [],
    );
    expect(path[0]).toEqual({ x: 50, y: 0 });
    expect(path.at(-1)).toEqual({ x: 150, y: 300 });
    expect(path.length).toBe(4);
  });

  it('should handle direct path with horizontal start and vertical end', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 50 }, 'right',
      { x: 200, y: 200 }, 'top',
      [],
    );
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path.at(-1)).toEqual({ x: 200, y: 200 });
    expect(path.length).toBe(3);
  });

  it('should handle direct path with vertical start and horizontal end', () => {
    const path = computeVisibilityPath(
      { x: 50, y: 0 }, 'bottom',
      { x: 300, y: 100 }, 'left',
      [],
    );
    expect(path[0]).toEqual({ x: 50, y: 0 });
    expect(path.at(-1)).toEqual({ x: 300, y: 100 });
    expect(path.length).toBe(3);
  });

  it('should fallback to direct path when no route found', () => {
    // Create obstacles that completely surround the destination
    const obstacles = [
      { x: 240, y: -60, width: 120, height: 60 },
      { x: 240, y: 0, width: 60, height: 100 },
      { x: 360, y: 0, width: 60, height: 100 },
      { x: 240, y: 100, width: 120, height: 60 },
    ];
    const path = computeVisibilityPath(
      { x: 0, y: 50 }, 'right',
      { x: 300, y: 50 }, 'left',
      obstacles,
      10,
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 50 });
    expect(path.at(-1)).toEqual({ x: 300, y: 50 });
  });

  it('should try second L-bend when first is blocked', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 0 }, 'right',
      { x: 200, y: 200 }, 'left',
      [{ x: 150, y: -20, width: 80, height: 60 }],
      20,
    );
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 200, y: 200 });
  });
});
