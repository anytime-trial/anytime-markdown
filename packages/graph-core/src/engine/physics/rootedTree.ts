import type { GraphEdge } from '../../types';
import { buildAdjacency } from './graphUtils';
import type { PhysicsBody } from './types';
import { computeHierarchicalLayout } from './hierarchical';

function makeEdge(from: string, to: string): GraphEdge {
  return {
    id: `${from}->${to}`,
    type: 'connector',
    from: { nodeId: from, x: 0, y: 0 },
    to: { nodeId: to, x: 0, y: 0 },
    style: { stroke: '', strokeWidth: 0 },
  };
}

/**
 * rootId 起点に辺向きを正規化したツリーを階層レイアウトする。
 * 循環・複数親は BFS tree edge を主経路とし非 tree edge は配置に使わない。
 * disconnected component は各 component の局所 root から配置する。
 */
export function computeRootedTreeLayout(
  bodies: Map<string, PhysicsBody>,
  edges: readonly GraphEdge[],
  rootId: string | undefined,
  direction: 'TB' | 'LR',
  levelGap = 180,
  nodeSpacing = 60,
): void {
  if (bodies.size === 0) return;
  const ids = Array.from(bodies.keys());

  const { undirected } = buildAdjacency(ids, edges, bodies);

  const treeEdges: GraphEdge[] = [];
  const visited = new Set<string>();
  const starts = [...ids];
  if (rootId && bodies.has(rootId)) starts.sort((a, b) => {
    const aIsRoot = a === rootId ? -1 : 0;
    return aIsRoot !== 0 ? aIsRoot : (b === rootId ? 1 : 0);
  });
  for (const s of starts) {
    if (visited.has(s)) continue;
    visited.add(s);
    const q = [s];
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of undirected.get(cur)!) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        treeEdges.push(makeEdge(cur, nb));
        q.push(nb);
      }
    }
  }

  computeHierarchicalLayout(bodies, treeEdges, direction, levelGap, nodeSpacing);
}
