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

    it('marks DAG re-merge as revisited (not cycle) with empty children', () => {
      // A → B → D, A → C → D の DAG。B 経由で展開された D は、
      // C 経由で再び現れた時点で revisited: true として畳まれる
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c'), fn('d')],
        edges: [callEdge('a', 'b'), callEdge('b', 'd'), callEdge('a', 'c'), callEdge('c', 'd')],
      });
      const tree = traverse(index, 'a', 'callees', 5);
      expect(tree!.children.map(c => c.id)).toEqual(['b', 'c']);
      const branchB = tree!.children.find(c => c.id === 'b');
      const branchC = tree!.children.find(c => c.id === 'c');
      expect(branchB!.children.map(c => c.id)).toEqual(['d']);
      expect(branchB!.children[0].cycle).toBeUndefined();
      expect(branchB!.children[0].revisited).toBeUndefined();
      expect(branchC!.children.map(c => c.id)).toEqual(['d']);
      expect(branchC!.children[0].revisited).toBe(true);
      expect(branchC!.children[0].cycle).toBeUndefined();
      expect(branchC!.children[0].children).toEqual([]);
    });

    it('distinguishes cycle (ancestor path) from revisited (sibling branch)', () => {
      // A → B → A (cycle), A → C → B (revisited)
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c')],
        edges: [callEdge('a', 'b'), callEdge('b', 'a'), callEdge('a', 'c'), callEdge('c', 'b')],
      });
      const tree = traverse(index, 'a', 'callees', 5);
      const branchB = tree!.children.find(c => c.id === 'b');
      const branchC = tree!.children.find(c => c.id === 'c');
      // B 経由で A はサイクル
      expect(branchB!.children[0].id).toBe('a');
      expect(branchB!.children[0].cycle).toBe(true);
      expect(branchB!.children[0].revisited).toBeUndefined();
      // C 経由で B は祖先ではないが既出 → revisited
      expect(branchC!.children[0].id).toBe('b');
      expect(branchC!.children[0].revisited).toBe(true);
      expect(branchC!.children[0].cycle).toBeUndefined();
    });

    it('omits children for which nodeFilter returns false', () => {
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c')],
        edges: [callEdge('a', 'b'), callEdge('a', 'c')],
      });
      const tree = traverse(index, 'a', 'callees', 5, {
        nodeFilter: node => node.id !== 'b',
      });
      expect(tree!.children.map(c => c.id)).toEqual(['c']);
    });

    it('returns null when nodeFilter rejects the root', () => {
      const index = buildIndex({
        nodes: [fn('a')],
        edges: [],
      });
      const tree = traverse(index, 'a', 'callees', 5, {
        nodeFilter: () => false,
      });
      expect(tree).toBeNull();
    });

    it('does not mark filtered-out node as revisited on another branch', () => {
      // A → B → D, A → C → D で D を filter で除外
      // → どちらの経路でも d は children に含まれず、revisited 判定対象にもならない
      const index = buildIndex({
        nodes: [fn('a'), fn('b'), fn('c'), fn('d')],
        edges: [callEdge('a', 'b'), callEdge('b', 'd'), callEdge('a', 'c'), callEdge('c', 'd')],
      });
      const tree = traverse(index, 'a', 'callees', 5, {
        nodeFilter: node => node.id !== 'd',
      });
      const branchB = tree!.children.find(c => c.id === 'b');
      const branchC = tree!.children.find(c => c.id === 'c');
      expect(branchB!.children).toEqual([]);
      expect(branchC!.children).toEqual([]);
    });
  });
});
