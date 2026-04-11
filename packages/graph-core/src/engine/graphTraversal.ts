import type { GraphEdge } from '../types';

export interface PathResult {
  nodeIds: string[];
  edgeIds: string[];
}

interface AdjEntry {
  readonly neighbor: string;
  readonly edgeId: string;
  readonly cost: number;
}

/**
 * Build an undirected adjacency list from edges.
 * Cost = 1 / weight (higher weight = closer = lower cost).
 * If weight is undefined or 0, cost defaults to 1.
 */
function buildAdjacencyList(edges: readonly GraphEdge[]): Map<string, AdjEntry[]> {
  const adj = new Map<string, AdjEntry[]>();

  const ensureNode = (id: string): AdjEntry[] => {
    let list = adj.get(id);
    if (!list) {
      list = [];
      adj.set(id, list);
    }
    return list;
  };

  for (const edge of edges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!fromId || !toId) continue;

    const w = edge.weight;
    const cost = (w !== undefined && w > 0) ? 1 / w : 1;

    ensureNode(fromId).push({ neighbor: toId, edgeId: edge.id, cost });
    ensureNode(toId).push({ neighbor: fromId, edgeId: edge.id, cost });
  }

  return adj;
}

/**
 * Extract the entry with the minimum cost from the priority queue.
 * Linear scan is fine for typical graph sizes in this app.
 */
function extractMin(pq: Array<[number, string]>): [number, string] {
  let minIdx = 0;
  for (let i = 1; i < pq.length; i++) {
    if (pq[i][0] < pq[minIdx][0]) {
      minIdx = i;
    }
  }
  const entry = pq[minIdx];
  pq.splice(minIdx, 1);
  return entry;
}

/**
 * Reconstruct the shortest path from the predecessor map.
 * @returns PathResult or null if no path can be traced.
 */
function reconstructPath(
  prev: ReadonlyMap<string, { node: string; edgeId: string }>,
  startId: string,
  targetId: string,
): PathResult | null {
  if (!prev.has(targetId)) {
    return null;
  }

  const nodeIds: string[] = [targetId];
  const edgeIds: string[] = [];
  let current = targetId;

  while (current !== startId) {
    const entry = prev.get(current);
    if (!entry) return null;
    edgeIds.unshift(entry.edgeId);
    nodeIds.unshift(entry.node);
    current = entry.node;
  }

  return { nodeIds, edgeIds };
}

/**
 * Find the shortest path between two nodes using Dijkstra's algorithm.
 *
 * Edges are treated as undirected (bidirectional).
 * Cost per edge = 1 / weight. If weight is undefined, cost = 1.
 *
 * @returns PathResult with ordered nodeIds and edgeIds, or null if no path exists.
 */
export function findShortestPath(
  edges: readonly GraphEdge[],
  startId: string,
  targetId: string,
): PathResult | null {
  if (startId === targetId) {
    return { nodeIds: [startId], edgeIds: [] };
  }

  const adj = buildAdjacencyList(edges);

  if (!adj.has(startId) || !adj.has(targetId)) {
    return null;
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edgeId: string }>();
  const visited = new Set<string>();
  const pq: Array<[number, string]> = [];

  dist.set(startId, 0);
  pq.push([0, startId]);

  while (pq.length > 0) {
    const [currentDist, current] = extractMin(pq);

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === targetId) break;

    const neighbors = adj.get(current);
    if (!neighbors) continue;

    for (const { neighbor, edgeId, cost } of neighbors) {
      if (visited.has(neighbor)) continue;

      const newDist = currentDist + cost;
      const knownDist = dist.get(neighbor);

      if (knownDist === undefined || newDist < knownDist) {
        dist.set(neighbor, newDist);
        prev.set(neighbor, { node: current, edgeId });
        pq.push([newDist, neighbor]);
      }
    }
  }

  return reconstructPath(prev, startId, targetId);
}
