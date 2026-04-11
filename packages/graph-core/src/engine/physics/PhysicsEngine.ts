import type { GraphNode, GraphEdge } from '../../types';
import type { PhysicsBody, PhysicsConfig } from './types';
import { DEFAULT_PHYSICS_CONFIG } from './types';
import { createBody, syncBodies } from './PhysicsBody';
import { SpatialGrid } from './SpatialGrid';
import { applySpring, applyRepulsion, applyCenterGravity, applyFRAttraction, applyFRRepulsion } from './forces';
import { detectCollision, resolveCollision } from './collision';
import { applyVpsc } from './vpsc';
import { computeHierarchicalLayout } from './hierarchical';

export class PhysicsEngine {
  private bodies = new Map<string, PhysicsBody>();
  private edges: GraphEdge[] = [];
  private readonly grid: SpatialGrid;
  private readonly config: PhysicsConfig;
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

    const algo = this.config.algorithm;
    if (algo === 'hierarchical') {
      computeHierarchicalLayout(
        this.bodies,
        edges,
        this.config.hierarchicalDirection,
        this.config.hierarchicalLevelGap,
        this.config.hierarchicalNodeSpacing,
      );
    } else if (algo === 'fruchterman-reingold' || algo === 'fruchterman-reingold-vpsc') {
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
    const algo = this.config.algorithm;
    if (algo === 'hierarchical') return; // non-iterative, computed in initLayout
    if (algo === 'fruchterman-reingold' || algo === 'fruchterman-reingold-vpsc') {
      this.stepFR();
    } else {
      this.stepEades();
    }
    if ((algo === 'eades-vpsc' || algo === 'fruchterman-reingold-vpsc') && this.iteration % 5 === 0) {
      applyVpsc(Array.from(this.bodies.values()), this.config.collisionPadding);
    }
  }

  private stepEades(): void {
    const bodies = Array.from(this.bodies.values());
    this.initForces(bodies);
    this.rebuildGrid(bodies);
    this.applyEdgeSprings();
    this.applyGridRepulsion(bodies);
    this.applyCenterGravityForce(bodies);
    this.integrateEades(bodies);
    this.resolveLayoutCollisions();
  }

  private initForces(bodies: PhysicsBody[]): void {
    for (const body of bodies) {
      body.fx = 0;
      body.fy = 0;
    }
  }

  private rebuildGrid(bodies: PhysicsBody[]): void {
    this.grid.clear();
    for (const body of bodies) {
      this.grid.insert(body);
    }
  }

  private applyEdgeSprings(): void {
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
  }

  private applyGridRepulsion(bodies: PhysicsBody[]): void {
    for (const body of bodies) {
      const nearby = this.grid.getNearby(body);
      for (const other of nearby) {
        if (body.id < other.id) {
          applyRepulsion(body, other, this.config.repulsionStrength);
        }
      }
    }
  }

  private applyCenterGravityForce(bodies: PhysicsBody[]): void {
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
  }

  private integrateEades(bodies: PhysicsBody[]): void {
    for (const body of bodies) {
      if (body.fixed) continue;
      body.vx = (body.vx + body.fx / body.mass) * this.config.damping;
      body.vy = (body.vy + body.fy / body.mass) * this.config.damping;
      body.x += body.vx;
      body.y += body.vy;
    }
  }

  private stepFR(): void {
    const bodies = Array.from(this.bodies.values());
    this.initForces(bodies);
    this.rebuildGrid(bodies);
    this.applyFRRepulsionAll(bodies);
    this.applyFRAttractionAll();
    this.integrateFR(bodies);
    this.temperature *= this.config.frCooling;
    this.resolveLayoutCollisions();
  }

  private applyFRRepulsionAll(bodies: PhysicsBody[]): void {
    const k = this.frK;
    for (const body of bodies) {
      const nearby = this.grid.getNearby(body);
      for (const other of nearby) {
        if (body.id < other.id) {
          applyFRRepulsion(body, other, k);
        }
      }
    }
  }

  private applyFRAttractionAll(): void {
    const k = this.frK;
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
  }

  private integrateFR(bodies: PhysicsBody[]): void {
    for (const body of bodies) {
      if (body.fixed) continue;
      const disp = Math.sqrt(body.fx * body.fx + body.fy * body.fy) || 1;
      const clamp = Math.min(disp, this.temperature) / disp;
      body.vx = body.fx * clamp;
      body.vy = body.fy * clamp;
      body.x += body.vx;
      body.y += body.vy;
    }
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
    const algo = this.config.algorithm;
    if (algo === 'hierarchical') return true; // non-iterative
    if (algo === 'fruchterman-reingold' || algo === 'fruchterman-reingold-vpsc') {
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

  /**
   * Spread connected nodes apart so that the edge-to-edge distance
   * between each connected pair is at least `minGap` pixels.
   * Returns the new positions of all moved nodes.
   */
  spreadConnected(
    nodes: GraphNode[] | null,
    edges: GraphEdge[],
    minGap: number,
  ): Map<string, { x: number; y: number }> {
    if (nodes) {
      this.syncFromNodes(nodes);
    }
    this.edges = edges;

    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (const edge of this.edges) {
        const fromId = edge.from.nodeId;
        const toId = edge.to.nodeId;
        if (!fromId || !toId) continue;
        const a = this.bodies.get(fromId);
        const b = this.bodies.get(toId);
        if (!a || !b) continue;

        if (this.spreadEdge(a, b, minGap)) {
          moved = true;
        }
      }
      if (!moved) break;
    }

    return this.getPositions();
  }

  /** Push two connected bodies apart so their edge-to-edge gap >= minGap. Returns true if moved. */
  private spreadEdge(a: PhysicsBody, b: PhysicsBody, minGap: number): boolean {
    const cx_a = a.x + a.width / 2;
    const cy_a = a.y + a.height / 2;
    const cx_b = b.x + b.width / 2;
    const cy_b = b.y + b.height / 2;
    const dx = cx_b - cx_a;
    const dy = cy_b - cy_a;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const { halfSpanA, halfSpanB } = this.computeHalfSpans(a, b, dx, dy);
    const requiredDist = halfSpanA + halfSpanB + minGap;

    if (dist >= requiredDist) return false;

    const shift = (requiredDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    if (!a.fixed) {
      a.x -= nx * shift;
      a.y -= ny * shift;
    }
    if (!b.fixed) {
      b.x += nx * shift;
      b.y += ny * shift;
    }
    return true;
  }

  /** Determine half-span for each body along the direction vector (horizontal vs vertical). */
  private computeHalfSpans(
    a: PhysicsBody,
    b: PhysicsBody,
    dx: number,
    dy: number,
  ): { halfSpanA: number; halfSpanB: number } {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx * (a.height + b.height) > absDy * (a.width + b.width)) {
      return { halfSpanA: a.width / 2, halfSpanB: b.width / 2 };
    }
    return { halfSpanA: a.height / 2, halfSpanB: b.height / 2 };
  }

  setConfig(patch: Partial<PhysicsConfig>): void {
    Object.assign(this.config, patch);
  }

  setCollisionEnabled(enabled: boolean): void {
    this.config.collisionEnabled = enabled;
  }
}
