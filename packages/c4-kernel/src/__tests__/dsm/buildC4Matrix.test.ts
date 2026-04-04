import { buildC4Matrix } from '../../dsm/buildC4Matrix';
import type { C4Model } from '../../types';

describe('buildC4Matrix', () => {
  const model: C4Model = {
    level: 'component',
    elements: [
      { id: 'a', type: 'component', name: 'Auth' },
      { id: 'b', type: 'component', name: 'API' },
      { id: 'c', type: 'component', name: 'DB' },
    ],
    relationships: [
      { from: 'a', to: 'b', label: 'calls' },
      { from: 'b', to: 'c', label: 'reads' },
    ],
  };

  it('should build adjacency matrix from C4 relationships', () => {
    const matrix = buildC4Matrix(model, 'component');
    expect(matrix.nodes).toHaveLength(3);
    expect(matrix.adjacency[0][1]).toBe(1); // a -> b
    expect(matrix.adjacency[1][2]).toBe(1); // b -> c
    expect(matrix.adjacency[0][2]).toBe(0); // a -> c なし
  });

  it('should handle bidirectional relationships', () => {
    const biModel: C4Model = {
      level: 'component',
      elements: [
        { id: 'x', type: 'component', name: 'X' },
        { id: 'y', type: 'component', name: 'Y' },
      ],
      relationships: [
        { from: 'x', to: 'y', bidirectional: true },
      ],
    };
    const matrix = buildC4Matrix(biModel, 'component');
    expect(matrix.adjacency[0][1]).toBe(1);
    expect(matrix.adjacency[1][0]).toBe(1);
  });

  it('should aggregate to package level using boundaries', () => {
    const pkgModel: C4Model = {
      level: 'component',
      elements: [
        { id: 'a1', type: 'component', name: 'A1', boundaryId: 'pkgA' },
        { id: 'a2', type: 'component', name: 'A2', boundaryId: 'pkgA' },
        { id: 'b1', type: 'component', name: 'B1', boundaryId: 'pkgB' },
      ],
      relationships: [
        { from: 'a1', to: 'b1', label: 'calls' },
      ],
    };
    const boundaries = [
      { id: 'pkgA', name: 'Package A' },
      { id: 'pkgB', name: 'Package B' },
    ];
    const matrix = buildC4Matrix(pkgModel, 'package', boundaries);
    expect(matrix.nodes).toHaveLength(2);
    expect(matrix.adjacency[0][1]).toBe(1); // pkgA -> pkgB
  });
});
