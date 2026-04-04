import type { TrailGraph, TrailEdge } from '../model/types';

export interface CustomTrailOptions {
  readonly graph: TrailGraph;
  readonly startNodeId: string;
  readonly mode: 'toTarget' | 'allReferenced' | 'allReferencing';
  readonly targetNodeId?: string;
  readonly maxDepth?: number;
}

type AdjacencyList = ReadonlyMap<string, readonly TrailEdge[]>;

function buildAdjacencyList(
  edges: readonly TrailEdge[],
  reverse: boolean,
): AdjacencyList {
  const adj = new Map<string, TrailEdge[]>();
  for (const edge of edges) {
    const key = reverse ? edge.target : edge.source;
    const list = adj.get(key);
    if (list) {
      list.push(edge);
    } else {
      adj.set(key, [edge]);
    }
  }
  return adj;
}

function bfsReachable(
  adj: AdjacencyList,
  startId: string,
  maxDepth: number,
  reverse: boolean,
): ReadonlySet<string> {
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId) ?? [];
      for (const edge of neighbors) {
        const neighbor = reverse ? edge.source : edge.target;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return visited;
}

function bfsPathToTarget(
  adj: AdjacencyList,
  startId: string,
  targetId: string,
  maxDepth: number,
): ReadonlySet<string> {
  const parent = new Map<string, string>();
  const visited = new Set<string>([startId]);
  let frontier = [startId];
  let found = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId) ?? [];
      for (const edge of neighbors) {
        const neighbor = edge.target;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, nodeId);
          if (neighbor === targetId) {
            found = true;
          }
          next.push(neighbor);
        }
      }
    }
    if (found) {
      break;
    }
    frontier = next;
  }

  if (!found) {
    return new Set([startId]);
  }

  const pathNodes = new Set<string>();
  let current: string | undefined = targetId;
  while (current !== undefined) {
    pathNodes.add(current);
    current = parent.get(current);
  }
  return pathNodes;
}

function extractSubgraph(
  graph: TrailGraph,
  nodeIds: ReadonlySet<string>,
): TrailGraph {
  const nodes = graph.nodes.filter(n => nodeIds.has(n.id));
  const edges = graph.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  return { nodes, edges, metadata: graph.metadata };
}

export function customTrail(options: CustomTrailOptions): TrailGraph {
  const { graph, startNodeId, mode, targetNodeId, maxDepth = Infinity } =
    options;

  switch (mode) {
    case 'allReferenced': {
      const adj = buildAdjacencyList(graph.edges, false);
      const reachable = bfsReachable(adj, startNodeId, maxDepth, false);
      return extractSubgraph(graph, reachable);
    }
    case 'allReferencing': {
      const adj = buildAdjacencyList(graph.edges, true);
      const reachable = bfsReachable(adj, startNodeId, maxDepth, true);
      return extractSubgraph(graph, reachable);
    }
    case 'toTarget': {
      const adj = buildAdjacencyList(graph.edges, false);
      const pathNodes = bfsPathToTarget(
        adj,
        startNodeId,
        targetNodeId ?? '',
        maxDepth,
      );
      return extractSubgraph(graph, pathNodes);
    }
  }
}
