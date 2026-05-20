import { findShortestPath } from '../../engine/graphTraversal';
import type { GraphEdge } from '../../types';

function makeEdge(id: string, fromId: string, toId: string, weight = 1): GraphEdge {
  return {
    id, type: 'line',
    from: { nodeId: fromId, x: 0, y: 0 },
    to: { nodeId: toId, x: 0, y: 0 },
    style: { stroke: '#000', strokeWidth: 1 },
    weight,
  };
}

describe('findShortestPath', () => {
  it('should find direct path between two connected nodes', () => {
    const edges = [makeEdge('e1', 'A', 'B')];
    const result = findShortestPath(edges, 'A', 'B');
    expect(result).toEqual({ nodeIds: ['A', 'B'], edgeIds: ['e1'] });
  });

  it('should find shortest path through multiple nodes', () => {
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
      makeEdge('e3', 'A', 'C', 0.1),
    ];
    const result = findShortestPath(edges, 'A', 'C');
    expect(result).toEqual({ nodeIds: ['A', 'B', 'C'], edgeIds: ['e1', 'e2'] });
  });

  it('should return null when no path exists', () => {
    const edges = [makeEdge('e1', 'A', 'B')];
    expect(findShortestPath(edges, 'A', 'C')).toBeNull();
  });

  it('should return single node when start equals target', () => {
    expect(findShortestPath([], 'A', 'A')).toEqual({ nodeIds: ['A'], edgeIds: [] });
  });

  it('should treat edges as undirected', () => {
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'C', 'B')];
    const result = findShortestPath(edges, 'A', 'C');
    expect(result).toEqual({ nodeIds: ['A', 'B', 'C'], edgeIds: ['e1', 'e2'] });
  });

  it('should use uniform cost when edges have no weight', () => {
    const edges = [
      { ...makeEdge('e1', 'A', 'B'), weight: undefined },
      { ...makeEdge('e2', 'B', 'C'), weight: undefined },
      { ...makeEdge('e3', 'A', 'C'), weight: undefined },
    ];
    const result = findShortestPath(edges, 'A', 'C');
    expect(result).toEqual({ nodeIds: ['A', 'C'], edgeIds: ['e3'] });
  });

  it('should return null when path is unreachable despite nodes existing in adj', () => {
    // A-B are connected, C-D are connected, but A/B and C/D are in different components
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'C', 'D')];
    // A exists in adj, D exists in adj, but no path A→D
    expect(findShortestPath(edges, 'A', 'D')).toBeNull();
  });

  it('should handle weight=0 edges (treated as cost=1)', () => {
    // weight=0 falls back to cost=1
    const edges = [{ ...makeEdge('e1', 'A', 'B'), weight: 0 }];
    const result = findShortestPath(edges, 'A', 'B');
    expect(result).toEqual({ nodeIds: ['A', 'B'], edgeIds: ['e1'] });
  });

  it('should skip edges without nodeId in adjacency build', () => {
    // Edge without nodeId should not contribute to adjacency list
    const edgeWithoutNode: GraphEdge = {
      id: 'nonode', type: 'line',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      style: { stroke: '#000', strokeWidth: 1 },
    };
    const normalEdge = makeEdge('e1', 'A', 'B');
    const result = findShortestPath([edgeWithoutNode, normalEdge], 'A', 'B');
    expect(result).toEqual({ nodeIds: ['A', 'B'], edgeIds: ['e1'] });
  });
});
