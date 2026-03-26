import type { PhysicsBody } from './types';

export function applySpring(
  a: PhysicsBody,
  b: PhysicsBody,
  strength: number,
  length: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const force = (dist - length) * strength;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  if (!a.fixed) {
    a.fx += fx;
    a.fy += fy;
  }
  if (!b.fixed) {
    b.fx -= fx;
    b.fy -= fy;
  }
}

export function applyRepulsion(
  a: PhysicsBody,
  b: PhysicsBody,
  strength: number,
): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0) {
    dx = (Math.random() - 0.5) * 0.1;
    dy = (Math.random() - 0.5) * 0.1;
  }
  const dist = Math.sqrt(distSq || 0.01);
  const force = strength / (dist * dist);
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  if (!a.fixed) {
    a.fx -= fx;
    a.fy -= fy;
  }
  if (!b.fixed) {
    b.fx += fx;
    b.fy += fy;
  }
}

export function applyCenterGravity(
  body: PhysicsBody,
  centerX: number,
  centerY: number,
  strength: number,
): void {
  if (body.fixed) return;
  body.fx += (centerX - body.x) * strength;
  body.fy += (centerY - body.y) * strength;
}

// --- Fruchterman-Reingold forces ---

/** FR attractive force: fa = d² / k (applied to connected pairs) */
export function applyFRAttraction(
  a: PhysicsBody,
  b: PhysicsBody,
  k: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const force = (dist * dist) / k;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  if (!a.fixed) {
    a.fx += fx;
    a.fy += fy;
  }
  if (!b.fixed) {
    b.fx -= fx;
    b.fy -= fy;
  }
}

/** FR repulsive force: fr = k² / d (applied to all pairs) */
export function applyFRRepulsion(
  a: PhysicsBody,
  b: PhysicsBody,
  k: number,
): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0) {
    dx = (Math.random() - 0.5) * 0.1;
    dy = (Math.random() - 0.5) * 0.1;
  }
  const dist = Math.sqrt(distSq || 0.01);
  const force = (k * k) / dist;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  if (!a.fixed) {
    a.fx -= fx;
    a.fy -= fy;
  }
  if (!b.fixed) {
    b.fx += fx;
    b.fy += fy;
  }
}
