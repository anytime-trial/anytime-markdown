import { detectCollision, resolveCollision, resolveAllCollisions } from '../../../engine/physics/collision';
import type { PhysicsBody } from '../../../engine/physics/types';

function makeBody(id: string, x: number, y: number, w = 100, h = 50): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, width: w, height: h, fixed: false, mass: 1 };
}

describe('detectCollision', () => {
  it('should detect overlapping bodies', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 50, 20);
    expect(detectCollision(a, b, 0)).toBe(true);
  });

  it('should not detect non-overlapping bodies', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 300, 300);
    expect(detectCollision(a, b, 0)).toBe(false);
  });

  it('should account for padding', () => {
    const a = makeBody('a', 0, 0, 100, 50);
    const b = makeBody('b', 105, 0, 100, 50);
    expect(detectCollision(a, b, 0)).toBe(false);
    expect(detectCollision(a, b, 10)).toBe(true);
  });
});

describe('resolveCollision', () => {
  it('should push bodies apart along minimum overlap axis', () => {
    const a = makeBody('a', 0, 0, 100, 50);
    const b = makeBody('b', 80, 0, 100, 50);
    resolveCollision(a, b, 10);
    expect(detectCollision(a, b, 10)).toBe(false);
  });

  it('should not move fixed bodies (a fixed)', () => {
    const a = { ...makeBody('a', 0, 0, 100, 50), fixed: true };
    const b = makeBody('b', 80, 0, 100, 50);
    resolveCollision(a, b, 10);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.x).toBeGreaterThan(80);
  });

  it('should move a when b is fixed', () => {
    const a = makeBody('a', 80, 0, 100, 50);
    const b = { ...makeBody('b', 0, 0, 100, 50), fixed: true };
    resolveCollision(a, b, 10);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(a.x).not.toBe(80); // a should have moved
  });
});

describe('resolveAllCollisions', () => {
  it('should resolve chain collisions', () => {
    const bodies = [
      makeBody('a', 0, 0, 100, 50),
      makeBody('b', 50, 0, 100, 50),
      makeBody('c', 100, 0, 100, 50),
    ];
    const moved = resolveAllCollisions('a', bodies, 10, 5);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        expect(detectCollision(bodies[i], bodies[j], 10)).toBe(false);
      }
    }
    expect(moved.length).toBeGreaterThan(0);
  });

  it('should return list of moved body positions', () => {
    const bodies = [
      makeBody('a', 0, 0, 100, 50),
      makeBody('b', 50, 0, 100, 50),
    ];
    const moved = resolveAllCollisions('a', bodies, 10, 5);
    for (const m of moved) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('x');
      expect(m).toHaveProperty('y');
    }
  });
});
