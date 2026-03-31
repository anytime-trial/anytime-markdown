import { useMemo } from 'react';
import type { GraphNode, GraphEdge } from '../types';
import type { NodeFilterConfig } from '../types/nodeFilter';

interface FilteredResult {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly hiddenNodeIds: ReadonlySet<string>;
}

export function useNodeFilter(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  config?: NodeFilterConfig,
): FilteredResult {
  return useMemo(() => {
    if (!config || (config.rangeFilters.length === 0 && config.textFilters.length === 0)) {
      return { nodes: [...nodes], edges: [...edges], hiddenNodeIds: new Set() };
    }

    const hiddenNodeIds = new Set<string>();

    const filteredNodes = nodes.filter(node => {
      const meta = node.metadata;
      if (!meta && (config.rangeFilters.length > 0 || config.textFilters.length > 0)) {
        hiddenNodeIds.add(node.id);
        return false;
      }
      if (!meta) return true;

      for (const rf of config.rangeFilters) {
        const val = meta[rf.key];
        if (typeof val !== 'number') { hiddenNodeIds.add(node.id); return false; }
        if (rf.min != null && val < rf.min) { hiddenNodeIds.add(node.id); return false; }
        if (rf.max != null && val > rf.max) { hiddenNodeIds.add(node.id); return false; }
      }

      for (const tf of config.textFilters) {
        const val = meta[tf.key];
        if (typeof val !== 'string') { hiddenNodeIds.add(node.id); return false; }
        if (!val.toLowerCase().includes(tf.value.toLowerCase())) { hiddenNodeIds.add(node.id); return false; }
      }

      return true;
    });

    const filteredEdges = edges.filter(edge => {
      const fromId = edge.from.nodeId;
      const toId = edge.to.nodeId;
      if (fromId && hiddenNodeIds.has(fromId)) return false;
      if (toId && hiddenNodeIds.has(toId)) return false;
      return true;
    });

    return { nodes: filteredNodes, edges: filteredEdges, hiddenNodeIds };
  }, [nodes, edges, config]);
}
