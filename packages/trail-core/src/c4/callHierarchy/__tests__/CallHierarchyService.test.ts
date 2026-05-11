import type { TrailEdge, TrailNode } from '../../../model/types';
import { buildIndex, traverse } from '../CallHierarchyService';

const fn = (id: string, label = id, line = 1): TrailNode => ({
  id,
  label,
  type: 'function',
  filePath: 'a.ts',
  line,
});

const callEdge = (source: string, target: string): TrailEdge => ({
  source,
  target,
  type: 'call',
});

describe('CallHierarchyService', () => {
  describe('buildIndex', () => {
    it('builds forward and reverse adjacency lists from call edges', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c')],
        edges: [callEdge('a', 'b'), callEdge('a', 'c')],
      });
      expect(index.forward.get('a')).toEqual(['b', 'c']);
      expect(index.reverse.get('b')).toEqual(['a']);
      expect(index.reverse.get('c')).toEqual(['a']);
      expect(index.nodes.get('a')?.id).toBe('a');
    });

    it('ignores non-call edges', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b')],
        edges: [
          { source: 'a', target: 'b', type: 'import' },
          callEdge('a', 'b'),
          { source: 'a', target: 'b', type: 'type_use' },
        ],
      });
      expect(index.forward.get('a')).toEqual(['b']);
      expect(index.reverse.get('b')).toEqual(['a']);
    });

    it('deduplicates duplicate call edges', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b')],
        edges: [callEdge('a', 'b'), callEdge('a', 'b'), callEdge('a', 'b')],
      });
      expect(index.forward.get('a')).toEqual(['b']);
    });
  });

  describe('traverse', () => {
    it('returns a root with direct callees at depth=1', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c')],
        edges: [callEdge('a', 'b'), callEdge('a', 'c')],
      });
      const tree = traverse(index, 'a', 'callees', 1);
      expect(tree).not.toBeNull();
      expect(tree!.id).toBe('a');
      expect(tree!.children.map(c => c.id)).toEqual(['b', 'c']);
      expect(tree!.children.every(c => c.children.length === 0)).toBe(true);
    });

    it('returns a root with direct callers at depth=1', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c')],
        edges: [callEdge('b', 'a'), callEdge('c', 'a')],
      });
      const tree = traverse(index, 'a', 'callers', 1);
      expect(tree!.children.map(c => c.id).sort()).toEqual(['b', 'c']);
    });

    it('respects maxDepth limit', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c'), fn('d')],
        edges: [callEdge('a', 'b'), callEdge('b', 'c'), callEdge('c', 'd')],
      });
      const tree = traverse(index, 'a', 'callees', 2);
      expect(tree!.children[0].id).toBe('b');
      expect(tree!.children[0].children[0].id).toBe('c');
      expect(tree!.children[0].children[0].children).toEqual([]);
    });

    it('marks cycles with cycle: true and empty children', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b')],
        edges: [callEdge('a', 'b'), callEdge('b', 'a')],
      });
      const tree = traverse(index, 'a', 'callees', 5);
      expect(tree!.children[0].id).toBe('b');
      const cycleChild = tree!.children[0].children[0];
      expect(cycleChild.id).toBe('a');
      expect(cycleChild.cycle).toBe(true);
      expect(cycleChild.children).toEqual([]);
    });

    it('returns null for unknown root id', () => {
      const index = buildIndex({
        nodes: [fn('a')],
        edges: [],
      });
      expect(traverse(index, 'missing', 'callees', 3)).toBeNull();
    });

    it('returns a leaf root for empty graph adjacency', () => {
      const index = buildIndex({
        nodes: [fn('a')],
        edges: [],
      });
      const tree = traverse(index, 'a', 'callees', 5);
      expect(tree).not.toBeNull();
      expect(tree!.id).toBe('a');
      expect(tree!.children).toEqual([]);
    });

    it('produces label/filePath/line from the indexed node', () => {
      const index = buildIndex({
        nodes: [
          { ...fn('a'), label: 'doWork', filePath: 'x.ts', line: 42 },
          fn('b'),
        ],
        edges: [callEdge('a', 'b')],
      });
      const tree = traverse(index, 'a', 'callees', 1);
      expect(tree!.label).toBe('doWork');
      expect(tree!.filePath).toBe('x.ts');
      expect(tree!.line).toBe(42);
    });
  });
});
