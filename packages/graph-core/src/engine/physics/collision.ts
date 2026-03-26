import type { PhysicsBody } from './types';

export function detectCollision(
  a: PhysicsBody,
  b: PhysicsBody,
  padding: number,
): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

export function resolveCollision(
  a: PhysicsBody,
  b: PhysicsBody,
  padding: number,
): void {
  const overlapX1 = (a.x + a.width + padding) - b.x;
  const overlapX2 = (b.x + b.width + padding) - a.x;
  const overlapY1 = (a.y + a.height + padding) - b.y;
  const overlapY2 = (b.y + b.height + padding) - a.y;

  const minOverlapX = Math.min(overlapX1, overlapX2);
  const minOverlapY = Math.min(overlapY1, overlapY2);

  let dx = 0;
  let dy = 0;

  // dx/dy represent the displacement to apply: positive means b moves right/down, a moves left/up
  if (minOverlapX < minOverlapY) {
    // overlapX1 < overlapX2 means a is to the left of b, so push b right (+)
    dx = overlapX1 < overlapX2 ? minOverlapX : -minOverlapX;
  } else {
    dy = overlapY1 < overlapY2 ? minOverlapY : -minOverlapY;
  }

  if (a.fixed && !b.fixed) {
    b.x += dx;
    b.y += dy;
  } else if (!a.fixed && b.fixed) {
    a.x -= dx;
    a.y -= dy;
  } else if (!a.fixed && !b.fixed) {
    a.x -= dx / 2;
    a.y -= dy / 2;
    b.x += dx / 2;
    b.y += dy / 2;
  }
}

export function resolveAllCollisions(
  movedId: string,
  bodies: PhysicsBody[],
  padding: number,
  maxIterations: number,
): { id: string; x: number; y: number }[] {
  const movedSet = new Set<string>();

  for (let iter = 0; iter < maxIterations; iter++) {
    let hasCollision = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (detectCollision(bodies[i], bodies[j], padding)) {
          resolveCollision(bodies[i], bodies[j], padding);
          hasCollision = true;
          if (bodies[i].id !== movedId) movedSet.add(bodies[i].id);
          if (bodies[j].id !== movedId) movedSet.add(bodies[j].id);
        }
      }
    }
    if (!hasCollision) break;
  }

  return bodies
    .filter((b) => movedSet.has(b.id))
    .map((b) => ({ id: b.id, x: b.x, y: b.y }));
}
