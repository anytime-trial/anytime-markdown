/**
 * Tarjan のアルゴリズムで強連結成分（SCC）を検出する。
 * 2ノード以上の SCC のみ返す（= 循環依存）。
 * @returns 各 SCC に含まれるノードID の配列
 */
export function detectCycles(
  adjacency: readonly (readonly number[])[],
  nodeIds: readonly string[],
): string[][] {
  const n = nodeIds.length;
  const index = new Array<number>(n).fill(-1);
  const lowlink = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let currentIndex = 0;
  const sccs: string[][] = [];

  function strongconnect(v: number): void {
    index[v] = currentIndex;
    lowlink[v] = currentIndex;
    currentIndex++;
    stack.push(v);
    onStack[v] = true;

    for (let w = 0; w < n; w++) {
      if (adjacency[v][w] === 0) continue;
      if (index[w] === -1) {
        strongconnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    }

    if (lowlink[v] === index[v]) {
      const scc: string[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        scc.push(nodeIds[w]);
      } while (w !== v);

      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (index[i] === -1) {
      strongconnect(i);
    }
  }

  return sccs;
}
