import type { TrailEdge, TrailNode } from '../../model/types';
import type {
  CallHierarchyDirection,
  CallHierarchyIndex,
  CallHierarchyNode,
} from './types';

export interface CallHierarchyGraphInput {
  readonly nodes: readonly TrailNode[];
  readonly edges: readonly TrailEdge[];
}

export function buildIndex(graph: CallHierarchyGraphInput): CallHierarchyIndex {
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const nodes = new Map<string, TrailNode>();

  for (const node of graph.nodes) {
    nodes.set(node.id, node);
  }

  for (const edge of graph.edges) {
    if (edge.type !== 'call') continue;
    appendUnique(forward, edge.source, edge.target);
    appendUnique(reverse, edge.target, edge.source);
  }

  return { forward, reverse, nodes };
}

function appendUnique(
  map: Map<string, string[]>,
  key: string,
  value: string,
): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  if (!list.includes(value)) {
    list.push(value);
  }
}

export function traverse(
  index: CallHierarchyIndex,
  rootId: string,
  direction: CallHierarchyDirection,
  maxDepth: number,
): CallHierarchyNode | null {
  if (!index.nodes.has(rootId)) return null;

  const adjacency = direction === 'callers' ? index.reverse : index.forward;

  const buildNode = (id: string): CallHierarchyNode => {
    const node = index.nodes.get(id);
    return {
      id,
      label: node?.label ?? id,
      filePath: node?.filePath ?? '',
      line: node?.line ?? 0,
      children: [],
    };
  };

  const dfs = (
    id: string,
    depth: number,
    ancestors: ReadonlySet<string>,
  ): CallHierarchyNode => {
    const base = buildNode(id);

    if (depth <= 0) return base;

    const neighbors = adjacency.get(id) ?? [];
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);

    const children: CallHierarchyNode[] = [];
    for (const neighborId of neighbors) {
      if (nextAncestors.has(neighborId)) {
        children.push({ ...buildNode(neighborId), cycle: true });
      } else {
        children.push(dfs(neighborId, depth - 1, nextAncestors));
      }
    }

    return { ...base, children };
  };

  return dfs(rootId, maxDepth, new Set());
}
