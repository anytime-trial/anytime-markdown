export { PhysicsEngine } from './PhysicsEngine';
export { SpatialGrid } from './SpatialGrid';
export { createBody, syncBodies } from './PhysicsBody';
export { applySpring, applyRepulsion, applyCenterGravity } from './forces';
export { detectCollision, resolveCollision, resolveAllCollisions } from './collision';
export { DEFAULT_PHYSICS_CONFIG } from './types';
export type { PhysicsBody, PhysicsConfig } from './types';
