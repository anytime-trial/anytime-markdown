import { applySpring, applyRepulsion, applyCenterGravity, applyFRAttraction, applyFRRepulsion } from '../../../engine/physics/forces';
import type { PhysicsBody } from '../../../engine/physics/types';

function makeBody(id: string, x: number, y: number): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, width: 100, height: 50, fixed: false, mass: 1 };
}

describe('applySpring', () => {
  it('should attract connected nodes toward springLength', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 500, 0);
    applySpring(a, b, 0.005, 200);
    expect(a.fx).toBeGreaterThan(0);
    expect(b.fx).toBeLessThan(0);
  });

  it('should push apart when closer than springLength', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 50, 0);
    applySpring(a, b, 0.005, 200);
    expect(a.fx).toBeLessThan(0);
    expect(b.fx).toBeGreaterThan(0);
  });

  it('should apply equal and opposite forces', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 300, 400);
    applySpring(a, b, 0.005, 200);
    expect(a.fx).toBeCloseTo(-b.fx, 10);
    expect(a.fy).toBeCloseTo(-b.fy, 10);
  });

  it('should not apply force to fixed bodies', () => {
    const a = { ...makeBody('a', 0, 0), fixed: true };
    const b = makeBody('b', 500, 0);
    applySpring(a, b, 0.005, 200);
    expect(a.fx).toBe(0);
    expect(a.fy).toBe(0);
    expect(b.fx).toBeLessThan(0);
  });
});

describe('applyRepulsion', () => {
  it('should push bodies apart', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 100, 0);
    applyRepulsion(a, b, 5000);
    expect(a.fx).toBeLessThan(0);
    expect(b.fx).toBeGreaterThan(0);
  });

  it('should apply stronger force when closer', () => {
    const a1 = makeBody('a1', 0, 0);
    const b1 = makeBody('b1', 50, 0);
    applyRepulsion(a1, b1, 5000);

    const a2 = makeBody('a2', 0, 0);
    const b2 = makeBody('b2', 200, 0);
    applyRepulsion(a2, b2, 5000);

    expect(Math.abs(a1.fx)).toBeGreaterThan(Math.abs(a2.fx));
  });

  it('should handle overlapping bodies without NaN', () => {
    const a = makeBody('a', 100, 100);
    const b = makeBody('b', 100, 100);
    applyRepulsion(a, b, 5000);
    expect(Number.isFinite(a.fx)).toBe(true);
    expect(Number.isFinite(a.fy)).toBe(true);
  });
});

describe('applyCenterGravity', () => {
  it('should pull body toward center', () => {
    const body = makeBody('a', 500, 300);
    applyCenterGravity(body, 250, 150, 0.01);
    expect(body.fx).toBeLessThan(0);
    expect(body.fy).toBeLessThan(0);
  });

  it('should not apply force when at center', () => {
    const body = makeBody('a', 100, 100);
    applyCenterGravity(body, 100, 100, 0.01);
    expect(body.fx).toBe(0);
    expect(body.fy).toBe(0);
  });
});

describe('applyFRAttraction', () => {
  it('should attract connected nodes (force = d²/k)', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 300, 0);
    applyFRAttraction(a, b, 100);
    // a pulled right, b pulled left
    expect(a.fx).toBeGreaterThan(0);
    expect(b.fx).toBeLessThan(0);
  });

  it('should apply stronger force at greater distance', () => {
    const a1 = makeBody('a1', 0, 0);
    const b1 = makeBody('b1', 100, 0);
    applyFRAttraction(a1, b1, 100);

    const a2 = makeBody('a2', 0, 0);
    const b2 = makeBody('b2', 300, 0);
    applyFRAttraction(a2, b2, 100);

    // d²/k grows with distance
    expect(Math.abs(a2.fx)).toBeGreaterThan(Math.abs(a1.fx));
  });
});

describe('applyFRRepulsion', () => {
  it('should push bodies apart (force = k²/d)', () => {
    const a = makeBody('a', 0, 0);
    const b = makeBody('b', 100, 0);
    applyFRRepulsion(a, b, 100);
    expect(a.fx).toBeLessThan(0);
    expect(b.fx).toBeGreaterThan(0);
  });

  it('should apply stronger force when closer', () => {
    const a1 = makeBody('a1', 0, 0);
    const b1 = makeBody('b1', 50, 0);
    applyFRRepulsion(a1, b1, 100);

    const a2 = makeBody('a2', 0, 0);
    const b2 = makeBody('b2', 200, 0);
    applyFRRepulsion(a2, b2, 100);

    expect(Math.abs(a1.fx)).toBeGreaterThan(Math.abs(a2.fx));
  });

  it('should handle overlapping bodies without NaN', () => {
    const a = makeBody('a', 100, 100);
    const b = makeBody('b', 100, 100);
    applyFRRepulsion(a, b, 100);
    expect(Number.isFinite(a.fx)).toBe(true);
  });
});
