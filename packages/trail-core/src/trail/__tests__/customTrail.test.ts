import { customTrail } from '../customTrail';
import type { TrailGraph } from '../../model/types';

const graph: TrailGraph = {
  nodes: [
    { id: 'a', label: 'A', type: 'file', filePath: 'a.ts', line: 1 },
    { id: 'b', label: 'B', type: 'class', filePath: 'b.ts', line: 1 },
    { id: 'c', label: 'C', type: 'function', filePath: 'c.ts', line: 1 },
    { id: 'd', label: 'D', type: 'function', filePath: 'd.ts', line: 1 },
    { id: 'e', label: 'E', type: 'function', filePath: 'e.ts', line: 1 },
  ],
  edges: [
    { source: 'a', target: 'b', type: 'import' },
    { source: 'b', target: 'c', type: 'call' },
    { source: 'c', target: 'd', type: 'call' },
    { source: 'd', target: 'e', type: 'call' },
    { source: 'e', target: 'a', type: 'import' },
  ],
  metadata: { projectRoot: '/p', analyzedAt: '', fileCount: 5 },
};

describe('customTrail', () => {
  describe('allReferenced', () => {
    it('should return all nodes reachable from start', () => {
      const result = customTrail({
        graph,
        startNodeId: 'a',
        mode: 'allReferenced',
      });
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('should respect maxDepth', () => {
      const result = customTrail({
        graph,
        startNodeId: 'a',
        mode: 'allReferenced',
        maxDepth: 2,
      });
      // a → b (depth 1), b → c (depth 2)
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('allReferencing', () => {
    it('should return all nodes that reference the start (reverse direction)', () => {
      const result = customTrail({
        graph,
        startNodeId: 'b',
        mode: 'allReferencing',
        maxDepth: 1,
      });
      // Only a → b, so a references b
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('toTarget', () => {
    it('should return path from start to target', () => {
      const result = customTrail({
        graph,
        startNodeId: 'a',
        mode: 'toTarget',
        targetNodeId: 'd',
      });
      // a → b → c → d
      expect(result.nodes.map(n => n.id)).toEqual(
        expect.arrayContaining(['a', 'b', 'c', 'd']),
      );
      expect(result.nodes.map(n => n.id)).not.toContain('e');
    });

    it('should return only start node if target is unreachable within maxDepth', () => {
      const result = customTrail({
        graph,
        startNodeId: 'a',
        mode: 'toTarget',
        targetNodeId: 'e',
        maxDepth: 2,
      });
      // a → b → c (depth 2), but e is at depth 4
      expect(result.nodes.map(n => n.id)).not.toContain('e');
    });
  });

  it('should include only edges between included nodes', () => {
    const result = customTrail({
      graph,
      startNodeId: 'a',
      mode: 'allReferenced',
      maxDepth: 1,
    });
    // a → b only
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 'a', target: 'b' });
  });
});
