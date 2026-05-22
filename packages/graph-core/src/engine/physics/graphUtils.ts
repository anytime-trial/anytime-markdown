import type { GraphEdge } from '../../types';
import type { PhysicsBody } from './types';

/**
 * 無向隣接マップと（有向）入次数を 1 パスで構築する。
 * 自己ループ・未知ノード参照・端点欠落のエッジは除外する。
 */
export function buildAdjacency(
  ids: string[],
  edges: readonly GraphEdge[],
  bodies: Map<string, PhysicsBody>,
): { undirected: Map<string, Set<string>>; indeg: Map<string, number> } {
  const undirected = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const id of ids) {
    undirected.set(id, new Set());
    indeg.set(id, 0);
  }
  for (const e of edges) {
    const f = e.from.nodeId, t = e.to.nodeId;
    if (!f || !t || !bodies.has(f) || !bodies.has(t) || f === t) continue;
    undirected.get(f)!.add(t);
    undirected.get(t)!.add(f);
    indeg.set(t, (indeg.get(t) ?? 0) + 1);
  }
  return { undirected, indeg };
}
