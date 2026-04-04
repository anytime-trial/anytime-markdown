import { diffMatrix } from '../../dsm/diffMatrix';
import type { DsmMatrix } from '../../dsm/types';

describe('diffMatrix', () => {
  it('should detect match, design_only, impl_only cells', () => {
    const design: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 1], [0, 0]],
    };
    const impl: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 1], [1, 0]],
    };
    const mapping = [
      { c4ElementId: 'a', sourcePath: 'a' },
      { c4ElementId: 'b', sourcePath: 'b' },
    ];
    const diff = diffMatrix(design, impl, mapping);
    expect(diff.cells[0][1].state).toBe('match');
    expect(diff.cells[1][0].state).toBe('impl_only');
    expect(diff.cells[0][0].state).toBe('none');
  });

  it('should detect design_only dependencies', () => {
    const design: DsmMatrix = {
      nodes: [
        { id: 'x', name: 'X', path: 'x', level: 'component' },
        { id: 'y', name: 'Y', path: 'y', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 1], [0, 0]],
    };
    const impl: DsmMatrix = {
      nodes: [
        { id: 'x', name: 'X', path: 'x', level: 'component' },
        { id: 'y', name: 'Y', path: 'y', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 0], [0, 0]],
    };
    const mapping = [
      { c4ElementId: 'x', sourcePath: 'x' },
      { c4ElementId: 'y', sourcePath: 'y' },
    ];
    const diff = diffMatrix(design, impl, mapping);
    expect(diff.cells[0][1].state).toBe('design_only');
  });

  it('should detect cyclic pairs', () => {
    const design: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 1], [1, 0]],
    };
    const impl: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'A', path: 'a', level: 'component' },
        { id: 'b', name: 'B', path: 'b', level: 'component' },
      ],
      edges: [],
      adjacency: [[0, 1], [1, 0]],
    };
    const mapping = [
      { c4ElementId: 'a', sourcePath: 'a' },
      { c4ElementId: 'b', sourcePath: 'b' },
    ];
    const diff = diffMatrix(design, impl, mapping);
    expect(diff.cyclicPairs).toHaveLength(1);
    expect(diff.cyclicPairs[0]).toEqual({ nodeA: 'a', nodeB: 'b' });
  });
});
