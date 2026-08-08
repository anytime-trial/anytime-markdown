import { clusterMatrix } from '../../dsm/cluster';
import type { DsmMatrix } from '../../dsm/types';

describe('clusterMatrix', () => {
  it('should reorder nodes to minimize bandwidth', () => {
    const matrix: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
        { id: 'c', name: 'C', path: 'c', level: 'component' },
      ],
      edges: [],
      adjacency: [
        [0, 1, 0],
        [0, 0, 0],
        [1, 0, 0],
      ],
    };
    const result = clusterMatrix(matrix);
    expect(result.nodes).toHaveLength(3);
    expect(result.adjacency).toHaveLength(3);
    expect(result.adjacency[0]).toHaveLength(3);
  });

  it('should handle disconnected components', () => {
    const matrix: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 0], [0, 0]],
    };
    const result = clusterMatrix(matrix);
    expect(result.nodes).toHaveLength(2);
  });

  it('should preserve edge information', () => {
    const matrix: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [{ source: 'a', target: 'b', imports: [] }],
      adjacency: [[0, 1], [0, 0]],
    };
    const result = clusterMatrix(matrix);
    expect(result.edges).toHaveLength(1);
  });

  it('should return same matrix for single node', () => {
    const matrix: DsmMatrix = {
      nodes: [{ id: 'a', name: 'A', path: 'a', level: 'component' }],
      edges: [],
      adjacency: [[0]],
    };
    const result = clusterMatrix(matrix);
    expect(result).toBe(matrix);
  });
});
