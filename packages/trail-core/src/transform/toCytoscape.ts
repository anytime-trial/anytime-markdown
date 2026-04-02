import type { TrailGraph } from '../model/types';

export interface CytoscapeElement {
  readonly data: Record<string, unknown>;
}

export function toCytoscape(graph: TrailGraph): CytoscapeElement[] {
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
