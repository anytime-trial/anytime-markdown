import path from 'node:path';

import type { TrailGraph, TrailNode } from './types';

function rebaseNodeId(id: string, filePath: string, rebasedFilePath: string): string {
  const prefix = `file::${filePath}`;
  if (id === prefix || id.startsWith(`${prefix}::`)) {
    return `file::${rebasedFilePath}${id.slice(prefix.length)}`;
  }
  return id;
}

export function rebaseTrailGraph(graph: TrailGraph, prefix: string, projectRoot: string): TrailGraph {
  if (prefix === '') {
    return { ...graph, metadata: { ...graph.metadata, projectRoot } };
  }

  const idMap = new Map<string, string>();
  const rebasedPaths = new Map<string, string>();
  for (const node of graph.nodes) {
    const rebasedFilePath = path.posix.join(prefix, node.filePath);
    rebasedPaths.set(node.filePath, rebasedFilePath);
    idMap.set(node.id, rebaseNodeId(node.id, node.filePath, rebasedFilePath));
  }

  const nodes: TrailNode[] = graph.nodes.map((node) => {
    const filePath = rebasedPaths.get(node.filePath) ?? path.posix.join(prefix, node.filePath);
    return {
      ...node,
      id: idMap.get(node.id) ?? node.id,
      filePath,
      parent: node.parent === undefined ? undefined : (idMap.get(node.parent) ?? node.parent),
    };
  });

  return {
    nodes,
    edges: graph.edges.map((edge) => ({
      ...edge,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    })),
    metadata: { ...graph.metadata, projectRoot },
  };
}
