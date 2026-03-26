export interface PhysicsBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  width: number;
  height: number;
  fixed: boolean;
  mass: number;
}

export interface PhysicsConfig {
  springStrength: number;
  springLength: number;
  repulsionStrength: number;
  centerGravity: number;
  damping: number;
  collisionEnabled: boolean;
  collisionPadding: number;
  velocityThreshold: number;
  maxIterations: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  springStrength: 0.005,
  springLength: 200,
  repulsionStrength: 5000,
  centerGravity: 0.01,
  damping: 0.9,
  collisionEnabled: false,
  collisionPadding: 10,
  velocityThreshold: 0.5,
  maxIterations: 300,
};
