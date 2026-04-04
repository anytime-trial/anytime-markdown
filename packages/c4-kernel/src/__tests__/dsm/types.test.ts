import type { DsmMatrix, DsmDiff } from '../../dsm/types';

describe('DSM types', () => {
  it('should create a valid DsmMatrix', () => {
    const matrix: DsmMatrix = {
      nodes: [
        { id: 'a', name: 'ModuleA', path: 'src/a.ts', level: 'component' },
        { id: 'b', name: 'ModuleB', path: 'src/b.ts', level: 'component' },
      ],
      edges: [
        { source: 'a', target: 'b', imports: [{ filePath: 'src/a.ts', line: 1, specifier: './b' }] },
      ],
      adjacency: [
        [0, 1],
        [0, 0],
      ],
    };
    expect(matrix.nodes).toHaveLength(2);
    expect(matrix.adjacency[0][1]).toBe(1);
  });

  it('should create a valid DsmDiff', () => {
    const diff: DsmDiff = {
      nodes: [
        { id: 'a', name: 'A', path: 'src/a.ts', level: 'component' },
      ],
      cells: [[{ state: 'match' }]],
      cyclicPairs: [],
    };
    expect(diff.cells[0][0].state).toBe('match');
  });
});
