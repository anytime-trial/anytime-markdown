import type { DsmMatrix } from './types';

/** 無向グラフとして対称化した隣接リストを構築する。 */
function buildAdjacency(matrix: DsmMatrix): number[][] {
  const n = matrix.nodes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const connected = i !== j && (matrix.adjacency[i][j] === 1 || matrix.adjacency[j][i] === 1);
      if (connected && !adj[i].includes(j)) adj[i].push(j);
    }
  }
  // 各ノードの次数でソート
  for (const neighbors of adj) {
    neighbors.sort((a, b) => adj[a].length - adj[b].length);
  }
  return adj;
}

/** 未訪問ノードの中で最小次数のノードを返す。 */
function findMinDegreeUnvisited(adj: number[][], visited: Set<number>): number {
  let start = -1;
  let minDeg = Infinity;
  for (let i = 0; i < adj.length; i++) {
    if (!visited.has(i) && adj[i].length < minDeg) {
      minDeg = adj[i].length;
      start = i;
    }
  }
  return start;
}

/** BFS で 1 連結成分を走査し、訪問順リストに追記する。 */
function traverseComponent(
  start: number,
  adj: number[][],
  visited: Set<number>,
  order: number[],
): void {
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

/** Cuthill-McKee 順序を生成する（複数連結成分対応）。 */
function buildCuthillMcKeeOrder(adj: number[][], n: number): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  while (visited.size < n) {
    const start = findMinDegreeUnvisited(adj, visited);
    traverseComponent(start, adj, visited, order);
  }
  return order;
}

/**
 * Reverse Cuthill-McKee アルゴリズムで行列を並べ替え、
 * バンド幅を最小化する（近い依存を対角線付近に集約）。
 */
export function clusterMatrix(matrix: DsmMatrix): DsmMatrix {
  const n = matrix.nodes.length;
  if (n <= 1) return matrix;

  const adj = buildAdjacency(matrix);
  const order = buildCuthillMcKeeOrder(adj, n);

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
