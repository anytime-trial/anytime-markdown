import { DEFAULT_PHYSICS_CONFIG } from '../../../engine/physics/types';
import type { PhysicsBody, PhysicsConfig } from '../../../engine/physics/types';

describe('PhysicsConfig defaults', () => {
  it('should have valid spring parameters', () => {
    expect(DEFAULT_PHYSICS_CONFIG.springStrength).toBe(0.005);
    expect(DEFAULT_PHYSICS_CONFIG.springLength).toBe(200);
  });

  it('should have valid repulsion parameters', () => {
    expect(DEFAULT_PHYSICS_CONFIG.repulsionStrength).toBe(5000);
  });

  it('should have valid damping and gravity', () => {
    expect(DEFAULT_PHYSICS_CONFIG.damping).toBe(0.9);
    expect(DEFAULT_PHYSICS_CONFIG.centerGravity).toBe(0.01);
  });

  it('should have collision disabled by default', () => {
    expect(DEFAULT_PHYSICS_CONFIG.collisionEnabled).toBe(false);
    expect(DEFAULT_PHYSICS_CONFIG.collisionPadding).toBe(10);
  });

  it('should have convergence parameters', () => {
    expect(DEFAULT_PHYSICS_CONFIG.velocityThreshold).toBe(0.5);
    expect(DEFAULT_PHYSICS_CONFIG.maxIterations).toBe(300);
  });

  it('should default to eades algorithm', () => {
    expect(DEFAULT_PHYSICS_CONFIG.algorithm).toBe('eades');
  });

  it('should have FR parameters', () => {
    expect(DEFAULT_PHYSICS_CONFIG.frAreaMultiplier).toBe(1.0);
    expect(DEFAULT_PHYSICS_CONFIG.frCooling).toBe(0.95);
  });
});

describe('PhysicsBody type', () => {
  it('should be assignable with all required fields', () => {
    const body: PhysicsBody = {
      id: 'node-1',
      x: 100, y: 200,
      vx: 0, vy: 0,
      fx: 0, fy: 0,
      width: 120, height: 60,
      fixed: false,
      mass: 1.0,
    };
    expect(body.id).toBe('node-1');
  });
});
