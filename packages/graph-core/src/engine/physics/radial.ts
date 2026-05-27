import type { GraphEdge } from '../../types';
import { buildAdjacency } from './graphUtils';
import type { PhysicsBody } from './types';

/** ルート中心の放射状レイアウト（非反復）。body 座標（左上）を破壊的に更新する。 */
export function computeRadialLayout(
  bodies: Map<string, PhysicsBody>,
  edges: readonly GraphEdge[],
  rootId: string | undefined,
  ringGap = 180,
): void {
  if (bodies.size === 0) return;
  const ids = Array.from(bodies.keys());

  const { undirected, indeg } = buildAdjacency(ids, edges, bodies);

  const pickRoot = (comp: string[]): string => {
    if (rootId && comp.includes(rootId)) return rootId;
    return comp.find((id) => (indeg.get(id) ?? 0) === 0) ?? comp[0];
  };

  const visited = new Set<string>();
  const order = [...ids];
  if (rootId && bodies.has(rootId)) order.sort((a, b) => {
    const aIsRoot = a === rootId ? -1 : 0;
    return aIsRoot !== 0 ? aIsRoot : (b === rootId ? 1 : 0);
  });

  let offsetY = 0;
  for (const start of order) {
    if (visited.has(start)) continue;
    const comp = collectComponent(start, visited, undirected);
    layoutComponent(bodies, undirected, pickRoot(comp), comp, ringGap, offsetY);
    let maxBottom = offsetY;
    for (const id of comp) { const b = bodies.get(id)!; maxBottom = Math.max(maxBottom, b.y + b.height); }
    offsetY = maxBottom + ringGap;
  }
}

/** BFS で連結成分を収集し、visited を更新する。 */
function collectComponent(
  start: string,
  visited: Set<string>,
  undirected: Map<string, Set<string>>,
): string[] {
  const comp: string[] = [];
  const q = [start];
  visited.add(start);
  while (q.length) {
    const cur = q.shift()!;
    comp.push(cur);
    for (const nb of undirected.get(cur)!) {
      if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
    }
  }
  return comp;
}

function layoutComponent(
  bodies: Map<string, PhysicsBody>,
  undirected: Map<string, Set<string>>,
  root: string,
  comp: string[],
  ringGap: number,
  offsetY: number,
): void {
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>();
  for (const id of comp) children.set(id, []);
  depth.set(root, 0);
  const seen = new Set([root]);
  const q = [root];
  while (q.length) {
    const cur = q.shift()!;
    for (const nb of undirected.get(cur)!) {
      if (seen.has(nb)) continue; // tree edge のみ。非 tree edge は配置に使わない
      seen.add(nb);
      depth.set(nb, (depth.get(cur) ?? 0) + 1);
      children.get(cur)!.push(nb);
      q.push(nb);
    }
  }

  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const ch = children.get(id)!;
    if (ch.length === 0) { leaves.set(id, 1); return 1; }
    let s = 0;
    for (const c of ch) s += countLeaves(c);
    leaves.set(id, s);
    return s;
  };
  countLeaves(root);

  const angle = new Map<string, number>();
  const assign = (id: string, start: number, end: number): void => {
    angle.set(id, (start + end) / 2);
    const ch = children.get(id)!;
    const total = leaves.get(id)!;
    let cursor = start;
    for (const c of ch) {
      const frac = (leaves.get(c)! / total) * (end - start);
      assign(c, cursor, cursor + frac);
      cursor += frac;
    }
  };
  assign(root, 0, Math.PI * 2);

  for (const id of comp) {
    const b = bodies.get(id)!;
    const r = (depth.get(id) ?? 0) * ringGap;
    const a = angle.get(id) ?? 0;
    const cx = r * Math.cos(a);
    const cy = offsetY + r * Math.sin(a);
    b.x = cx - b.width / 2;
    b.y = cy - b.height / 2;
  }
}
