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

export type LayoutAlgorithm = 'eades' | 'fruchterman-reingold';

export interface PhysicsConfig {
  algorithm: LayoutAlgorithm;
  // Eades parameters
  springStrength: number;
  springLength: number;
  repulsionStrength: number;
  centerGravity: number;
  damping: number;
  // FR parameters
  frAreaMultiplier: number;
  frCooling: number;
  // Common
  collisionEnabled: boolean;
  collisionPadding: number;
  velocityThreshold: number;
  maxIterations: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  algorithm: 'eades',
  springStrength: 0.005,
  springLength: 200,
  repulsionStrength: 5000,
  centerGravity: 0.01,
  damping: 0.9,
  frAreaMultiplier: 1.0,
  frCooling: 0.95,
  collisionEnabled: false,
  collisionPadding: 10,
  velocityThreshold: 0.5,
  maxIterations: 300,
};
