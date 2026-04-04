import { interpolateColor,linearScale } from '@anytime-markdown/graph-core/engine';
import { useMemo } from 'react';

import type { GraphEdge,GraphNode } from '../types';
import type { DataMappingConfig } from '../types/dataMapping';
import { DEFAULT_DATA_MAPPING } from '../types/dataMapping';

interface MappedResult {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * metadata / weight の数値を視覚属性（サイズ・色・線幅）にマッピングするフック。
 *
 * - sizeKey: node.metadata[sizeKey] → ノードの width / height
 * - colorKey: node.metadata[colorKey] → ノードの fill 色
 * - weight: edge.weight → エッジの strokeWidth
 */
export function useDataMapping(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  config?: DataMappingConfig,
): MappedResult {
  return useMemo(() => {
    const hasSizeMapping = config?.sizeKey != null;
    const hasColorMapping = config?.colorKey != null;
    const hasWeightMapping = edges.some((e) => e.weight != null);

    if (!hasSizeMapping && !hasColorMapping && !hasWeightMapping) {
      return { nodes, edges };
    }

    const sizeRange = config?.sizeRange ?? DEFAULT_DATA_MAPPING.sizeRange ?? [60, 200] as const;
    const colorRange = config?.colorRange ?? DEFAULT_DATA_MAPPING.colorRange ?? ['#c6dbef', '#08519c'] as const;
    const weightRange = config?.weightRange ?? DEFAULT_DATA_MAPPING.weightRange ?? [1, 8] as const;

    // --- ノードマッピング ---
    let mappedNodes: GraphNode[] = nodes as GraphNode[];

    if (hasSizeMapping || hasColorMapping) {
      const sizeValues: number[] = [];
      const colorValues: number[] = [];

      for (const node of nodes) {
        if (hasSizeMapping) {
          const v = node.metadata?.[config?.sizeKey ?? ''];
          if (typeof v === 'number') sizeValues.push(v);
        }
        if (hasColorMapping) {
          const v = node.metadata?.[config?.colorKey ?? ''];
          if (typeof v === 'number') colorValues.push(v);
        }
      }

      const sizeScale = hasSizeMapping && sizeValues.length > 0
        ? linearScale(
            Math.min(...sizeValues), Math.max(...sizeValues),
            sizeRange[0], sizeRange[1],
          )
        : null;

      const colorScale = hasColorMapping && colorValues.length > 0
        ? linearScale(
            Math.min(...colorValues), Math.max(...colorValues),
            0, 1,
          )
        : null;

      mappedNodes = nodes.map((node) => {
        let { width, height, style } = node;
        let changed = false;

        if (sizeScale) {
          const raw = node.metadata?.[config?.sizeKey ?? ''];
          if (typeof raw === 'number') {
            const size = sizeScale(raw);
            width = size;
            height = size;
            changed = true;
          }
        }

        if (colorScale) {
          const raw = node.metadata?.[config?.colorKey ?? ''];
          if (typeof raw === 'number') {
            const t = colorScale(raw);
            const fill = interpolateColor(colorRange[0], colorRange[1], t);
            style = { ...style, fill };
            changed = true;
          }
        }

        return changed ? { ...node, width, height, style } : node;
      });
    }

    // --- エッジマッピング ---
    let mappedEdges: GraphEdge[] = edges as GraphEdge[];

    if (hasWeightMapping) {
      const weights: number[] = [];
      for (const edge of edges) {
        if (edge.weight != null) weights.push(edge.weight);
      }

      if (weights.length > 0) {
        const weightScale = linearScale(
          Math.min(...weights), Math.max(...weights),
          weightRange[0], weightRange[1],
        );

        mappedEdges = edges.map((edge) => {
          if (edge.weight == null) return edge;
          const strokeWidth = weightScale(edge.weight);
          return { ...edge, style: { ...edge.style, strokeWidth } };
        });
      }
    }

    return { nodes: mappedNodes, edges: mappedEdges };
  }, [nodes, edges, config]);
}
