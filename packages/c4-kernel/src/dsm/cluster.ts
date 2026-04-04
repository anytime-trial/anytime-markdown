import type { DsmMatrix } from './types';

/**
 * Reverse Cuthill-McKee アルゴリズムで行列を並べ替え、
 * バンド幅を最小化する（近い依存を対角線付近に集約）。
 */
export function clusterMatrix(matrix: DsmMatrix): DsmMatrix {
  const n = matrix.nodes.length;
  if (n <= 1) return matrix;

  // 無向グラフとしての隣接リスト構築（対称化）
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (matrix.adjacency[i][j] === 1 || matrix.adjacency[j][i] === 1)) {
        if (!adj[i].includes(j)) adj[i].push(j);
      }
    }
  }

  // 各ノードの次数でソート
  for (const neighbors of adj) {
    neighbors.sort((a, b) => adj[a].length - adj[b].length);
  }

  // BFS ベースの Cuthill-McKee
  const visited = new Set<number>();
  const order: number[] = [];

  while (visited.size < n) {
    let start = -1;
    let minDeg = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited.has(i) && adj[i].length < minDeg) {
        minDeg = adj[i].length;
        start = i;
      }
    }

    const queue: number[] = [start];
    visited.add(start);
    let head = 0;

    while (head < queue.length) {
      const v = queue[head++];
      order.push(v);
      for (const w of adj[v]) {
        if (!visited.has(w)) {
          visited.add(w);
          queue.push(w);
        }
      }
    }
  }

  // Reverse Cuthill-McKee
  order.reverse();

  // 並べ替えの適用
  const newNodes = order.map(i => matrix.nodes[i]);
  const newAdj = order.map(i => order.map(j => matrix.adjacency[i][j]));

  return {
    nodes: newNodes,
    edges: matrix.edges,
    adjacency: newAdj,
  };
}
