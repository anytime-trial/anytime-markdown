import type { DsmMatrix, DsmDiff, DsmDiffCell, DsmCellState, DsmMapping, DsmNode, CyclicPair } from './types';

/**
 * C4モデルDSMとソースコードDSMを比較し、差分を検出する。
 * mapping でC4要素IDとソースパスの対応を定義する。
 */
export function diffMatrix(
  design: DsmMatrix,
  impl: DsmMatrix,
  mapping: readonly DsmMapping[],
): DsmDiff {
  const c4ToImpl = new Map(mapping.map(m => [m.c4ElementId, m.sourcePath]));
  const implToIdx = new Map(impl.nodes.map((n, i) => [n.id, i]));

  const nodes: DsmNode[] = design.nodes.map(n => ({ ...n }));
  const n = nodes.length;
  const cells: DsmDiffCell[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => ({ state: 'none' as DsmCellState })),
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        cells[i][j] = { state: 'none' };
        continue;
      }

      const designHas = design.adjacency[i][j] === 1;
      const implI = implToIdx.get(c4ToImpl.get(design.nodes[i].id) ?? '');
      const implJ = implToIdx.get(c4ToImpl.get(design.nodes[j].id) ?? '');
      const implHas = implI !== undefined && implJ !== undefined && impl.adjacency[implI][implJ] === 1;

      let state: DsmCellState;
      if (designHas && implHas) {
        state = 'match';
      } else if (designHas) {
        state = 'design_only';
      } else if (implHas) {
        state = 'impl_only';
      } else {
        state = 'none';
      }
      cells[i][j] = { state };
    }
  }

  const cyclicPairs: CyclicPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const hasIJ = cells[i][j].state !== 'none';
      const hasJI = cells[j][i].state !== 'none';
      if (hasIJ && hasJI) {
        cyclicPairs.push({ nodeA: nodes[i].id, nodeB: nodes[j].id });
      }
    }
  }

  return { nodes, cells, cyclicPairs };
}
