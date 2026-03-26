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

  describe('spreadConnected', () => {
    it('should ensure minimum gap between connected nodes', () => {
      // Place two connected nodes very close (overlapping)
      const n1 = createNode('rect', 0, 0);   // width=120, height=60
      const n2 = createNode('rect', 50, 0);   // overlapping with n1
      const testEdges = [
        createEdge('connector', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 }),
      ];
      const engine = new PhysicsEngine();
      const positions = engine.spreadConnected([n1, n2], testEdges, 100);

      const p1 = positions.get(n1.id)!;
      const p2 = positions.get(n2.id)!;
      // Edge-to-edge gap should be at least 100px
      const centerDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      // center-to-center must be >= halfWidth1 + halfWidth2 + 100 = 60 + 60 + 100 = 220
      expect(centerDist).toBeGreaterThanOrEqual(219); // allow small float error
    });

    it('should not move nodes that are already far enough apart', () => {
      const n1 = createNode('rect', 0, 0);
      const n2 = createNode('rect', 500, 0);  // far apart
      const testEdges = [
        createEdge('connector', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 }),
      ];
      const engine = new PhysicsEngine();
      const positions = engine.spreadConnected([n1, n2], testEdges, 100);

      const p1 = positions.get(n1.id)!;
      const p2 = positions.get(n2.id)!;
      expect(p1.x).toBe(0);
      expect(p2.x).toBe(500);
    });

    it('should handle chain of connected nodes', () => {
      const n1 = createNode('rect', 0, 0);
      const n2 = createNode('rect', 30, 0);
      const n3 = createNode('rect', 60, 0);
      const testEdges = [
        createEdge('connector', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 }),
        createEdge('connector', { nodeId: n2.id, x: 0, y: 0 }, { nodeId: n3.id, x: 0, y: 0 }),
      ];
      const engine = new PhysicsEngine();
      const positions = engine.spreadConnected([n1, n2, n3], testEdges, 100);

      const p1 = positions.get(n1.id)!;
      const p2 = positions.get(n2.id)!;
      const p3 = positions.get(n3.id)!;

      // All pairs should have sufficient gap
      const dist12 = Math.abs(p2.x - p1.x);
      const dist23 = Math.abs(p3.x - p2.x);
      // Each center-to-center >= 120 + 100 = 220 (width=120, so halfSpan=60 each)
      expect(dist12).toBeGreaterThanOrEqual(219);
      expect(dist23).toBeGreaterThanOrEqual(219);
    });
  });
});
