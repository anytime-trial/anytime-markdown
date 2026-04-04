import { detectCycles } from '../../dsm/detectCycles';

describe('detectCycles', () => {
  it('should detect a simple cycle', () => {
    const adjacency = [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ];
    const nodeIds = ['a', 'b', 'c'];
    const sccs = detectCycles(adjacency, nodeIds);
    expect(sccs).toHaveLength(1);
    expect(sccs[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('should return empty for acyclic graph', () => {
    const adjacency = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    const nodeIds = ['a', 'b', 'c'];
    const sccs = detectCycles(adjacency, nodeIds);
    expect(sccs).toHaveLength(0);
  });

  it('should detect multiple SCCs', () => {
    const adjacency = [
      [0, 1, 0, 0],
      [1, 0, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 1, 0],
    ];
    const nodeIds = ['a', 'b', 'c', 'd'];
    const sccs = detectCycles(adjacency, nodeIds);
    expect(sccs).toHaveLength(2);
  });

  it('should ignore self-loops (single node SCCs)', () => {
    const adjacency = [[1]];
    const nodeIds = ['a'];
    const sccs = detectCycles(adjacency, nodeIds);
    expect(sccs).toHaveLength(0);
  });
});
