import { PhysicsEngine } from '../../../engine/physics/PhysicsEngine';
import type { GraphNode, GraphEdge } from '../../../types';
import { createNode, createEdge } from '../../../types';

// PhysicsEngine uses requestAnimationFrame; mock it for synchronous testing
let rafCallbacks: Array<(t: number) => void> = [];
(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCallbacks.push(cb);
  return rafCallbacks.length;
};
(globalThis as any).cancelAnimationFrame = (_id: number) => {
  rafCallbacks = [];
};

function flushFrames(n: number): void {
  for (let i = 0; i < n; i++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) cb(performance.now());
  }
}

describe('PhysicsEngine', () => {
  let nodes: GraphNode[];
  let edges: GraphEdge[];

  beforeEach(() => {
    rafCallbacks = [];
    const n1 = createNode('rect', 0, 0);
    const n2 = createNode('rect', 500, 0);
    const n3 = createNode('rect', 0, 500);
    nodes = [n1, n2, n3];
    edges = [
      createEdge('connector', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 }),
    ];
  });

  describe('startLayout / stopLayout', () => {
    it('should call onUpdate with node positions', () => {
      const updates: Map<string, { x: number; y: number }>[] = [];
      const engine = new PhysicsEngine({}, (positions) => {
        updates.push(new Map(positions));
      });
      engine.startLayout(nodes, edges);
      flushFrames(5);
      engine.stopLayout();
      expect(updates.length).toBeGreaterThan(0);
      for (const update of updates) {
        for (const node of nodes) {
          expect(update.has(node.id)).toBe(true);
        }
      }
    });

    it('should move connected nodes closer together', () => {
      let lastPositions: Map<string, { x: number; y: number }> = new Map();
      const engine = new PhysicsEngine({}, (positions) => {
        lastPositions = new Map(positions);
      });
      engine.startLayout(nodes, edges);
      flushFrames(50);
      engine.stopLayout();

      const p1 = lastPositions.get(nodes[0].id)!;
      const p2 = lastPositions.get(nodes[1].id)!;
      const initialDist = 500;
      const finalDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      expect(finalDist).toBeLessThan(initialDist);
    });
  });

  describe('resolveCollisions', () => {
    it('should push overlapping nodes apart', () => {
      const n1 = createNode('rect', 0, 0);
      const n2 = createNode('rect', 50, 0);
      const engine = new PhysicsEngine({ collisionEnabled: true, collisionPadding: 10 }, () => {});
      engine.syncFromNodes([n1, n2]);
      engine.updateBody(n1.id, { x: 50, y: 0 });
      const moved = engine.resolveCollisions(n1.id);
      expect(moved.length).toBeGreaterThan(0);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const engine = new PhysicsEngine({}, () => {});
      engine.setConfig({ damping: 0.8 });
      engine.setCollisionEnabled(true);
    });
  });

  describe('convergence', () => {
    it('should stop automatically when velocities are below threshold', () => {
      let updateCount = 0;
      const engine = new PhysicsEngine(
        { velocityThreshold: 100, maxIterations: 10 },
        () => { updateCount++; },
      );
      engine.startLayout(nodes, edges);
      flushFrames(20);
      expect(updateCount).toBeLessThan(20);
    });
  });
});
