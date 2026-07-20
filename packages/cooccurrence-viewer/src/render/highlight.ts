import type { RenderGraph } from '../types';

export interface HighlightSelection {
  nodeIndexes: ReadonlySet<number>;
  linkIndexes: ReadonlySet<number>;
}

export function computeNeighborhoodHighlight(graph: RenderGraph, selectedNodeIndex: number | null): HighlightSelection | null {
  if (selectedNodeIndex === null) return null;
  const nodes = new Set<number>([selectedNodeIndex]);
  const links = new Set<number>();
  for (const link of graph.links) {
    if (link.source !== selectedNodeIndex && link.target !== selectedNodeIndex) continue;
    links.add(link.index);
    nodes.add(link.source);
    nodes.add(link.target);
  }
  return { nodeIndexes: nodes, linkIndexes: links };
}
