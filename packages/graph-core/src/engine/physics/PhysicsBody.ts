import type { GraphNode } from '../../types';
import type { PhysicsBody } from './types';

export function createBody(node: GraphNode): PhysicsBody {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
    width: node.width,
    height: node.height,
    fixed: node.locked === true,
    mass: 1.0,
  };
}

export function syncBodies(
  nodes: GraphNode[],
  existing: Map<string, PhysicsBody>,
): Map<string, PhysicsBody> {
  const result = new Map<string, PhysicsBody>();
  for (const node of nodes) {
    const prev = existing.get(node.id);
    if (prev) {
      result.set(node.id, {
        ...prev,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fixed: node.locked === true,
      });
    } else {
      result.set(node.id, createBody(node));
    }
  }
  return result;
}
