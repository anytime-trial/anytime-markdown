import type { PhysicsBody } from '../engine/physics/types';
import type { GraphEdge } from '../types';
import { computeHierarchicalLayout } from '../engine/physics/hierarchical';

function makeBody(id: string, x = 0, y = 0): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, fx: 0, fy: 0, width: 150, height: 100, fixed: false, mass: 1 };
}

function makeEdge(fromId: string, toId: string): GraphEdge {
  return {
    id: `${fromId}-${toId}`,
    type: 'connector',
    from: { nodeId: fromId, x: 0, y: 0 },
    to: { nodeId: toId, x: 0, y: 0 },
    style: { stroke: '#000', strokeWidth: 2, startShape: 'none', endShape: 'arrow' },
  };
}

describe('computeHierarchicalLayout', () => {
  describe('layer assignment', () => {
    it('should assign linear chain to increasing layers (TB)', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      // A should be above B, B above C
      expect(bodies.get('A')!.y).toBeLessThan(bodies.get('B')!.y);
      expect(bodies.get('B')!.y).toBeLessThan(bodies.get('C')!.y);
    });

    it('should assign linear chain to increasing layers (LR)', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
      computeHierarchicalLayout(bodies, edges, 'LR', 180, 60);

      // A should be left of B, B left of C
      expect(bodies.get('A')!.x).toBeLessThan(bodies.get('B')!.x);
      expect(bodies.get('B')!.x).toBeLessThan(bodies.get('C')!.x);
    });

    it('should place branching nodes in the same layer', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B'), makeEdge('A', 'C')];
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      // B and C should be at the same y (same layer)
      expect(bodies.get('B')!.y).toBe(bodies.get('C')!.y);
      // B and C should have different x
      expect(bodies.get('B')!.x).not.toBe(bodies.get('C')!.x);
    });
  });

  describe('cycle handling', () => {
    it('should handle cyclic graphs without infinite loops', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')];
      // Should not throw or hang
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      // All nodes should have finite coordinates
      for (const body of bodies.values()) {
        expect(Number.isFinite(body.x)).toBe(true);
        expect(Number.isFinite(body.y)).toBe(true);
      }
    });
  });

  describe('isolated nodes', () => {
    it('should place isolated nodes at layer 0', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B')];
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      // C is isolated, should be at same layer as A (root layer)
      expect(bodies.get('C')!.y).toBe(bodies.get('A')!.y);
    });
  });

  describe('spacing', () => {
    it('should respect levelGap between layers (TB)', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
      ]);
      const edges = [makeEdge('A', 'B')];
      const levelGap = 200;
      computeHierarchicalLayout(bodies, edges, 'TB', levelGap, 60);

      const diff = bodies.get('B')!.y - bodies.get('A')!.y;
      // Gap between layers = node height (100) + levelGap
      expect(diff).toBe(bodies.get('A')!.height + levelGap);
    });

    it('should respect nodeSpacing within a layer', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
      ]);
      const edges = [makeEdge('A', 'B'), makeEdge('A', 'C')];
      const nodeSpacing = 80;
      computeHierarchicalLayout(bodies, edges, 'TB', 180, nodeSpacing);

      const bx = bodies.get('B')!.x;
      const cx = bodies.get('C')!.x;
      // Distance between B and C centers should account for width + spacing
      expect(Math.abs(cx - bx)).toBe(bodies.get('B')!.width + nodeSpacing);
    });
  });

  describe('fixed nodes', () => {
    it('should not move fixed (locked) nodes', () => {
      const bodies = new Map([
        ['A', makeBody('A', 500, 500)],
        ['B', makeBody('B')],
      ]);
      bodies.get('A')!.fixed = true;
      const edges = [makeEdge('A', 'B')];
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      expect(bodies.get('A')!.x).toBe(500);
      expect(bodies.get('A')!.y).toBe(500);
    });
  });

  describe('complex graph', () => {
    it('should handle diamond-shaped DAG', () => {
      const bodies = new Map([
        ['A', makeBody('A')],
        ['B', makeBody('B')],
        ['C', makeBody('C')],
        ['D', makeBody('D')],
      ]);
      const edges = [
        makeEdge('A', 'B'), makeEdge('A', 'C'),
        makeEdge('B', 'D'), makeEdge('C', 'D'),
      ];
      computeHierarchicalLayout(bodies, edges, 'TB', 180, 60);

      // Layer 0: A, Layer 1: B/C, Layer 2: D
      const ay = bodies.get('A')!.y;
      const by = bodies.get('B')!.y;
      const cy = bodies.get('C')!.y;
      const dy = bodies.get('D')!.y;
      expect(by).toBe(cy);         // Same layer
      expect(ay).toBeLessThan(by);  // A above B/C
      expect(by).toBeLessThan(dy);  // B/C above D
    });
  });

  describe('single node', () => {
    it('should handle a single node without edges', () => {
      const bodies = new Map([['A', makeBody('A')]]);
      computeHierarchicalLayout(bodies, [], 'TB', 180, 60);
      expect(Number.isFinite(bodies.get('A')!.x)).toBe(true);
      expect(Number.isFinite(bodies.get('A')!.y)).toBe(true);
    });
  });
});
