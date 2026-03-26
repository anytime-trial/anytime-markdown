import { SpatialGrid } from '../../../engine/physics/SpatialGrid';
import type { PhysicsBody } from '../../../engine/physics/types';

function makeBody(id: string, x: number, y: number, w = 100, h = 50): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, width: w, height: h, fixed: false, mass: 1 };
}

describe('SpatialGrid', () => {
  it('should return nearby bodies within the same cell', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', 10, 10);
    const b = makeBody('b', 50, 50);
    grid.insert(a);
    grid.insert(b);
    const nearby = grid.getNearby(a);
    expect(nearby).toContainEqual(b);
  });

  it('should not return distant bodies', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', 0, 0);
    const far = makeBody('far', 1000, 1000);
    grid.insert(a);
    grid.insert(far);
    const nearby = grid.getNearby(a);
    expect(nearby).not.toContainEqual(far);
  });

  it('should return bodies in adjacent cells', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', 190, 190);
    const b = makeBody('b', 210, 210);
    grid.insert(a);
    grid.insert(b);
    const nearby = grid.getNearby(a);
    expect(nearby).toContainEqual(b);
  });

  it('should not include the query body itself', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', 10, 10);
    grid.insert(a);
    const nearby = grid.getNearby(a);
    expect(nearby).not.toContainEqual(a);
  });

  it('should handle clear and re-insert', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', 10, 10);
    grid.insert(a);
    grid.clear();
    const nearby = grid.getNearby(a);
    expect(nearby).toHaveLength(0);
  });

  it('should handle negative coordinates', () => {
    const grid = new SpatialGrid(200);
    const a = makeBody('a', -100, -100);
    const b = makeBody('b', -50, -50);
    grid.insert(a);
    grid.insert(b);
    const nearby = grid.getNearby(a);
    expect(nearby).toContainEqual(b);
  });

  it('should handle 500+ bodies efficiently', () => {
    const grid = new SpatialGrid(200);
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 500; i++) {
      const body = makeBody(`n${i}`, Math.random() * 5000, Math.random() * 5000);
      bodies.push(body);
      grid.insert(body);
    }
    const start = performance.now();
    for (const body of bodies) {
      grid.getNearby(body);
    }
    const elapsed = performance.now() - start;
    // 500 getNearby calls should complete in < 50ms
    expect(elapsed).toBeLessThan(50);
  });
});
