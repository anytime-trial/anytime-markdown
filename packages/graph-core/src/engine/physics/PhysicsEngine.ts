import type { GraphNode, GraphEdge } from '../../types';
import type { PhysicsBody, PhysicsConfig } from './types';
import { DEFAULT_PHYSICS_CONFIG } from './types';
import { createBody, syncBodies } from './PhysicsBody';
import { SpatialGrid } from './SpatialGrid';
import { applySpring, applyRepulsion, applyCenterGravity, applyFRAttraction, applyFRRepulsion } from './forces';
import { detectCollision, resolveCollision } from './collision';

export class PhysicsEngine {
  private bodies = new Map<string, PhysicsBody>();
  private edges: GraphEdge[] = [];
  private grid: SpatialGrid;
  private config: PhysicsConfig;
  private iteration = 0;
  private temperature = 0;
  private frK = 0;

  constructor(config: Partial<PhysicsConfig> = {}) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    this.grid = new SpatialGrid(200);
  }

  addBody(node: GraphNode): void {
    this.bodies.set(node.id, createBody(node));
  }

  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  updateBody(id: string, patch: Partial<PhysicsBody>): void {
    const body = this.bodies.get(id);
    if (body) {
      Object.assign(body, patch);
    }
  }

  syncFromNodes(nodes: GraphNode[]): void {
    this.bodies = syncBodies(nodes, this.bodies);
  }

  initLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.syncFromNodes(nodes);
    this.edges = edges;
    this.iteration = 0;

    if (this.config.algorithm === 'fruchterman-reingold') {
      const n = this.bodies.size || 1;
      const area = n * 200 * 200 * this.config.frAreaMultiplier;
      this.frK = Math.sqrt(area / n);
      this.temperature = this.frK * 2;
    }
  }

  /** Run one simulation step. Returns true if still running, false if converged. */
  tick(): boolean {
    this.step();
    this.iteration++;
    return !this.isConverged() && this.iteration < this.config.maxIterations;
  }

  getPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    for (const [id, body] of this.bodies) {
      positions.set(id, { x: body.x, y: body.y });
    }
    return positions;
  }

  private step(): void {
    if (this.config.algorithm === 'fruchterman-reingold') {
      this.stepFR();
    } else {
      this.stepEades();
    }
  }

  private stepEades(): void {
    const bodies = Array.from(this.bodies.values());

    for (const body of bodies) {
      body.fx = 0;
      body.fy = 0;
    }

    this.grid.clear();
    for (const body of bodies) {
      this.grid.insert(body);
    }

    for (const edge of this.edges) {
      const fromId = edge.from.nodeId;
      const toId = edge.to.nodeId;
      if (!fromId || !toId) continue;
      const a = this.bodies.get(fromId);
      const b = this.bodies.get(toId);
      if (a && b) {
        applySpring(a, b, this.config.springStrength, this.config.springLength);
      }
    }

    for (const body of bodies) {
      const nearby = this.grid.getNearby(body);
      for (const other of nearby) {
        if (body.id < other.id) {
          applyRepulsion(body, other, this.config.repulsionStrength);
        }
      }
    }

    let cx = 0;
    let cy = 0;
    for (const body of bodies) {
      cx += body.x;
      cy += body.y;
    }
    cx /= bodies.length || 1;
    cy /= bodies.length || 1;
    for (const body of bodies) {
      applyCenterGravity(body, cx, cy, this.config.centerGravity);
    }

    for (const body of bodies) {
      if (body.fixed) continue;
      body.vx = (body.vx + body.fx / body.mass) * this.config.damping;
      body.vy = (body.vy + body.fy / body.mass) * this.config.damping;
      body.x += body.vx;
      body.y += body.vy;
    }

    this.resolveLayoutCollisions();
  }

  private stepFR(): void {
    const bodies = Array.from(this.bodies.values());
    const k = this.frK;

    for (const body of bodies) {
      body.fx = 0;
      body.fy = 0;
    }

    // Repulsive forces (all pairs via spatial grid)
    this.grid.clear();
    for (const body of bodies) {
      this.grid.insert(body);
    }
    for (const body of bodies) {
      const nearby = this.grid.getNearby(body);
      for (const other of nearby) {
        if (body.id < other.id) {
          applyFRRepulsion(body, other, k);
        }
      }
    }

    // Attractive forces (edges only)
    for (const edge of this.edges) {
      const fromId = edge.from.nodeId;
      const toId = edge.to.nodeId;
      if (!fromId || !toId) continue;
      const a = this.bodies.get(fromId);
      const b = this.bodies.get(toId);
      if (a && b) {
        applyFRAttraction(a, b, k);
      }
    }

    // Displacement clamped by temperature
    for (const body of bodies) {
      if (body.fixed) continue;
      const disp = Math.sqrt(body.fx * body.fx + body.fy * body.fy) || 1;
      const clamp = Math.min(disp, this.temperature) / disp;
      body.vx = body.fx * clamp;
      body.vy = body.fy * clamp;
      body.x += body.vx;
      body.y += body.vy;
    }

    // Cool temperature
    this.temperature *= this.config.frCooling;

    this.resolveLayoutCollisions();
  }

  private resolveLayoutCollisions(): void {
    const bodies = Array.from(this.bodies.values());
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (detectCollision(bodies[i], bodies[j], this.config.collisionPadding)) {
          resolveCollision(bodies[i], bodies[j], this.config.collisionPadding);
        }
      }
    }
  }

  private isConverged(): boolean {
    if (this.config.algorithm === 'fruchterman-reingold') {
      return this.temperature < 0.5;
    }
    for (const body of this.bodies.values()) {
      if (body.fixed) continue;
      const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
      if (speed > this.config.velocityThreshold) return false;
    }
    return true;
  }

  resolveCollisions(movedId: string): { id: string; x: number; y: number }[] {
    if (!this.config.collisionEnabled) return [];

    const bodies = Array.from(this.bodies.values());
    const movedBody = this.bodies.get(movedId);
    if (!movedBody) return [];

    const movedSet = new Set<string>();
    for (let iter = 0; iter < 5; iter++) {
      let hasCollision = false;
      for (const other of bodies) {
        if (other.id === movedId) continue;
        if (detectCollision(movedBody, other, this.config.collisionPadding)) {
          const savedFixed = movedBody.fixed;
          movedBody.fixed = true;
          resolveCollision(movedBody, other, this.config.collisionPadding);
          movedBody.fixed = savedFixed;
          movedSet.add(other.id);
          hasCollision = true;
        }
      }
      if (!hasCollision) break;
    }

    return bodies
      .filter((b) => movedSet.has(b.id))
      .map((b) => ({ id: b.id, x: b.x, y: b.y }));
  }

  setConfig(patch: Partial<PhysicsConfig>): void {
    Object.assign(this.config, patch);
  }

  setCollisionEnabled(enabled: boolean): void {
    this.config.collisionEnabled = enabled;
  }
}
