import type { PhysicsBody } from './types';

interface VpscConstraint {
  left: number;
  right: number;
  gap: number;
}

/** Extract position and size along the primary axis */
function getAxisValues(body: PhysicsBody, isX: boolean): { pos: number; size: number } {
  return isX
    ? { pos: body.x, size: body.width }
    : { pos: body.y, size: body.height };
}

/** Check if two bodies overlap on the cross axis */
function hasCrossAxisOverlap(
  lb: PhysicsBody,
  rb: PhysicsBody,
  isX: boolean,
  padding: number,
): boolean {
  if (isX) {
    return lb.y < rb.y + rb.height + padding && lb.y + lb.height + padding > rb.y;
  }
  return lb.x < rb.x + rb.width + padding && lb.x + lb.width + padding > rb.x;
}

/**
 * Generate separation constraints for one axis.
 * Sorts bodies by position on the given axis and creates constraints
 * for overlapping pairs only.
 */
function generateConstraints(
  bodies: PhysicsBody[],
  axis: 'x' | 'y',
  padding: number,
): VpscConstraint[] {
  const isX = axis === 'x';
  const indices = bodies.map((_, i) => i);
  indices.sort((a, b) => {
    return getAxisValues(bodies[a], isX).pos - getAxisValues(bodies[b], isX).pos;
  });

  const constraints: VpscConstraint[] = [];
  for (let i = 0; i < indices.length; i++) {
    const li = indices[i];
    const lb = bodies[li];
    const { pos: lPos, size: lSize } = getAxisValues(lb, isX);

    for (let j = i + 1; j < indices.length; j++) {
      const ri = indices[j];
      const rb = bodies[ri];
      const { pos: rPos, size: rSize } = getAxisValues(rb, isX);

      // If right body starts beyond left body's extent + padding, no more overlaps
      if (rPos >= lPos + lSize + padding) break;

      if (hasCrossAxisOverlap(lb, rb, isX, padding)) {
        constraints.push({
          left: li,
          right: ri,
          gap: (lSize + rSize) / 2 + padding,
        });
      }
    }
  }
  return constraints;
}

/** Apply overlap correction for a single constraint pair */
function applyConstraintOverlap(
  positions: number[],
  c: VpscConstraint,
  fixed: boolean[],
): boolean {
  const diff = positions[c.right] - positions[c.left];
  if (diff >= c.gap) return false;

  const overlap = c.gap - diff;
  const leftFixed = fixed[c.left];
  const rightFixed = fixed[c.right];

  if (leftFixed && rightFixed) return false;
  if (leftFixed) {
    positions[c.right] += overlap;
  } else if (rightFixed) {
    positions[c.left] -= overlap;
  } else {
    positions[c.left] -= overlap / 2;
    positions[c.right] += overlap / 2;
  }
  return true;
}

/**
 * Project positions to satisfy separation constraints.
 * Uses iterative constraint projection (Gauss-Seidel style).
 */
function projectConstraints(
  positions: number[],
  constraints: VpscConstraint[],
  fixed: boolean[],
  maxIter: number = 10,
): void {
  for (let iter = 0; iter < maxIter; iter++) {
    let satisfied = true;
    for (const c of constraints) {
      if (applyConstraintOverlap(positions, c, fixed)) {
        satisfied = false;
      }
    }
    if (satisfied) break;
  }
}

/**
 * Apply VPSC constraint projection to resolve node overlaps.
 * Processes x-axis and y-axis independently.
 */
export function applyVpsc(bodies: PhysicsBody[], padding: number): void {
  if (bodies.length < 2) return;

  const fixed = bodies.map(b => b.fixed);

  // Generate constraints for both axes before applying either
  const xConstraints = generateConstraints(bodies, 'x', padding);
  const yConstraints = generateConstraints(bodies, 'y', padding);

  // X-axis projection
  if (xConstraints.length > 0) {
    const xCenters = bodies.map(b => b.x + b.width / 2);
    projectConstraints(xCenters, xConstraints, fixed);
    for (let i = 0; i < bodies.length; i++) {
      if (!bodies[i].fixed) {
        bodies[i].x = xCenters[i] - bodies[i].width / 2;
      }
    }
  }

  // Y-axis projection
  if (yConstraints.length > 0) {
    const yCenters = bodies.map(b => b.y + b.height / 2);
    projectConstraints(yCenters, yConstraints, fixed);
    for (let i = 0; i < bodies.length; i++) {
      if (!bodies[i].fixed) {
        bodies[i].y = yCenters[i] - bodies[i].height / 2;
      }
    }
  }
}
