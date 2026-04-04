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

  it('should produce only orthogonal segments (no diagonal lines)', () => {
    const path = computeVisibilityPath(
      { x: 0, y: 0 }, 'right',
      { x: 400, y: 300 }, 'left',
      [],
    );
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

  it('should produce a detour path when start and end overlap', () => {
    const path = computeVisibilityPath(
      { x: 100, y: 100 }, 'right',
      { x: 100, y: 100 }, 'left',
      [],
    );
    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path[0]).toEqual({ x: 100, y: 100 });
    expect(path.at(-1)).toEqual({ x: 100, y: 100 });
    // All segments must be orthogonal
    for (let i = 0; i < path.length - 1; i++) {
      const curr = path[i];
      const next = path[i + 1];
      expect(curr.x === next.x || curr.y === next.y).toBe(true);
    }
    // Path must extend away from the point (not zero-length)
    const maxX = Math.max(...path.map(p => p.x));
    const minX = Math.min(...path.map(p => p.x));
    expect(maxX - minX).toBeGreaterThan(0);
  });

  it('should produce a detour path when start and end overlap with vertical sides', () => {
    const path = computeVisibilityPath(
      { x: 100, y: 100 }, 'bottom',
      { x: 100, y: 100 }, 'top',
      [],
    );
    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path[0]).toEqual({ x: 100, y: 100 });
    expect(path.at(-1)).toEqual({ x: 100, y: 100 });
    const maxY = Math.max(...path.map(p => p.y));
    const minY = Math.min(...path.map(p => p.y));
    expect(maxY - minY).toBeGreaterThan(0);
  });
});
