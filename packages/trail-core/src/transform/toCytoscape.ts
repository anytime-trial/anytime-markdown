import type { TrailGraph } from '../model/types';

export interface CytoscapeElement {
  readonly data: Record<string, unknown>;
}

export interface ToCytoscapeOptions {
  readonly bundleEdges?: boolean;
}

export function toCytoscape(
  graph: TrailGraph,
  options?: ToCytoscapeOptions,
): CytoscapeElement[] {
  const nodes: CytoscapeElement[] = graph.nodes.map(node => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      filePath: node.filePath,
      line: node.line,
      ...(node.parent ? { parent: node.parent } : {}),
    },
  }));

  if (options?.bundleEdges) {
    return [...nodes, ...bundleEdgeElements(graph)];
  }

  const edges: CytoscapeElement[] = graph.edges.map((edge, i) => ({
    data: {
      id: `edge-${i}`,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    },
  }));

  return [...nodes, ...edges];
}

function bundleEdgeElements(graph: TrailGraph): CytoscapeElement[] {
  const groups = new Map<string, { source: string; target: string; types: string[] }>();

  for (const edge of graph.edges) {
    const key = `${edge.source}::${edge.target}`;
    const group = groups.get(key);
    if (group) {
      group.types.push(edge.type);
    } else {
      groups.set(key, { source: edge.source, target: edge.target, types: [edge.type] });
    }
  }

  const edges: CytoscapeElement[] = [];
  let i = 0;
  for (const group of groups.values()) {
    if (group.types.length >= 2) {
      edges.push({
        data: {
          id: `edge-${i}`,
          source: group.source,
          target: group.target,
          type: 'bundled',
          weight: group.types.length,
          bundledTypes: group.types,
        },
      });
    } else {
      edges.push({
        data: {
          id: `edge-${i}`,
          source: group.source,
          target: group.target,
          type: group.types[0],
        },
      });
    }
    i++;
  }

  return edges;
}
