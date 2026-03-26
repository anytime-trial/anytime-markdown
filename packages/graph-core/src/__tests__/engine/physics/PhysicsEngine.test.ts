import { PhysicsEngine } from '../../../engine/physics/PhysicsEngine';
import type { GraphNode, GraphEdge } from '../../../types';
import { createNode, createEdge } from '../../../types';

describe('PhysicsEngine', () => {
  let nodes: GraphNode[];
  let edges: GraphEdge[];

  beforeEach(() => {
    const n1 = createNode('rect', 0, 0);
    const n2 = createNode('rect', 500, 0);
    const n3 = createNode('rect', 0, 500);
    nodes = [n1, n2, n3];
    edges = [
      createEdge('connector', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 }),
    ];
  });

  describe('initLayout / tick / getPositions', () => {
    it('should return positions for all nodes after tick', () => {
      const engine = new PhysicsEngine();
      engine.initLayout(nodes, edges);
      engine.tick();
      const positions = engine.getPositions();
      for (const node of nodes) {
        expect(positions.has(node.id)).toBe(true);
      }
    });

    it('should move connected nodes closer together', () => {
      const engine = new PhysicsEngine();
      engine.initLayout(nodes, edges);
      for (let i = 0; i < 50; i++) {
        if (!engine.tick()) break;
      }
      const positions = engine.getPositions();
      const p1 = positions.get(nodes[0].id)!;
      const p2 = positions.get(nodes[1].id)!;
      const initialDist = 500;
      const finalDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      expect(finalDist).toBeLessThan(initialDist);
    });
  });

  describe('resolveCollisions', () => {
    it('should push overlapping nodes apart', () => {
      const n1 = createNode('rect', 0, 0);
      const n2 = createNode('rect', 50, 0);
      const engine = new PhysicsEngine({ collisionEnabled: true, collisionPadding: 10 });
      engine.syncFromNodes([n1, n2]);
      engine.updateBody(n1.id, { x: 50, y: 0 });
      const moved = engine.resolveCollisions(n1.id);
      expect(moved.length).toBeGreaterThan(0);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const engine = new PhysicsEngine();
      engine.setConfig({ damping: 0.8 });
      engine.setCollisionEnabled(true);
    });
  });

  describe('convergence', () => {
    it('should converge and return false from tick', () => {
      const engine = new PhysicsEngine({ velocityThreshold: 100, maxIterations: 10 });
      engine.initLayout(nodes, edges);
      let tickCount = 0;
      while (engine.tick()) {
        tickCount++;
        if (tickCount > 20) break;
      }
      expect(tickCount).toBeLessThan(20);
    });
  });

  describe('Fruchterman-Reingold algorithm', () => {
    it('should move connected nodes closer together', () => {
      const engine = new PhysicsEngine({ algorithm: 'fruchterman-reingold' });
      engine.initLayout(nodes, edges);
      for (let i = 0; i < 50; i++) {
        if (!engine.tick()) break;
      }
      const positions = engine.getPositions();
      const p1 = positions.get(nodes[0].id)!;
      const p2 = positions.get(nodes[1].id)!;
      const finalDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      expect(finalDist).toBeLessThan(500); // initial distance
    });

    it('should converge via temperature cooling', () => {
      const engine = new PhysicsEngine({ algorithm: 'fruchterman-reingold', maxIterations: 500 });
      engine.initLayout(nodes, edges);
      let tickCount = 0;
      while (engine.tick()) {
        tickCount++;
        if (tickCount > 500) break;
      }
      expect(tickCount).toBeLessThan(500);
    });
  });
});
