import { applyVpsc } from '../../../engine/physics/vpsc';
import type { PhysicsBody } from '../../../engine/physics/types';

function makeBody(id: string, x: number, y: number, w = 120, h = 60): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, width: w, height: h, fixed: false, mass: 1 };
}

describe('applyVpsc', () => {
  it('should separate horizontally overlapping nodes', () => {
    const bodies = [
      makeBody('a', 0, 0),    // x: 0..120
      makeBody('b', 50, 0),   // x: 50..170, overlaps with a
    ];
    applyVpsc(bodies, 10);
    // After VPSC, a and b should not overlap (with 10px padding)
    const gap = bodies[1].x - (bodies[0].x + bodies[0].width);
    expect(gap).toBeGreaterThanOrEqual(9.9); // allow float
  });

  it('should separate vertically overlapping nodes', () => {
    const bodies = [
      makeBody('a', 0, 0),
      makeBody('b', 0, 30),   // y: 30..90, overlaps with a (0..60)
    ];
    applyVpsc(bodies, 10);
    const gap = bodies[1].y - (bodies[0].y + bodies[0].height);
    expect(gap).toBeGreaterThanOrEqual(9.9);
  });

  it('should not move nodes that are already separated', () => {
    const bodies = [
      makeBody('a', 0, 0),
      makeBody('b', 300, 0),  // far apart
    ];
    applyVpsc(bodies, 10);
    expect(bodies[0].x).toBe(0);
    expect(bodies[1].x).toBe(300);
  });

  it('should not move fixed nodes', () => {
    const bodies = [
      { ...makeBody('a', 0, 0), fixed: true },
      makeBody('b', 50, 0),
    ];
    applyVpsc(bodies, 10);
    expect(bodies[0].x).toBe(0);
    expect(bodies[0].y).toBe(0);
    // b should be pushed right
    expect(bodies[1].x).toBeGreaterThan(50);
  });

  it('should handle chain of overlapping nodes', () => {
    const bodies = [
      makeBody('a', 0, 0),
      makeBody('b', 50, 0),
      makeBody('c', 100, 0),
    ];
    applyVpsc(bodies, 10);
    // All pairs should be separated
    for (let i = 0; i < bodies.length - 1; i++) {
      const gap = bodies[i + 1].x - (bodies[i].x + bodies[i].width);
      expect(gap).toBeGreaterThanOrEqual(9.9);
    }
  });

  it('should handle nodes overlapping on both axes', () => {
    const bodies = [
      makeBody('a', 0, 0),
      makeBody('b', 60, 30),  // overlaps both x and y
    ];
    applyVpsc(bodies, 10);
    // At least one axis should be resolved
    const xGap = bodies[1].x - (bodies[0].x + bodies[0].width);
    const yGap = bodies[1].y - (bodies[0].y + bodies[0].height);
    expect(xGap >= 9.9 || yGap >= 9.9).toBe(true);
  });

  it('should handle single node without error', () => {
    const bodies = [makeBody('a', 0, 0)];
    expect(() => applyVpsc(bodies, 10)).not.toThrow();
  });

  it('should handle empty array without error', () => {
    expect(() => applyVpsc([], 10)).not.toThrow();
  });

  it('should move left node when right is fixed', () => {
    const bodies = [
      makeBody('a', 50, 0),
      { ...makeBody('b', 0, 0), fixed: true },
    ];
    applyVpsc(bodies, 10);
    expect(bodies[1].x).toBe(0); // b should stay fixed
  });
});
