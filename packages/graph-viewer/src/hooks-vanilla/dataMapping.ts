import { interpolateColor, linearScale } from '@anytime-markdown/graph-core/engine';

import type { GraphEdge, GraphNode } from '../types';
import type { DataMappingConfig } from '../types/dataMapping';
import { DEFAULT_DATA_MAPPING } from '../types/dataMapping';

export type { DataMappingConfig };

export interface MappedResult {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

// ---------------------------------------------------------------------------
// Internal helpers (元 useDataMapping の private 関数と同一ロジック)
// ---------------------------------------------------------------------------

function collectMetadataValues(
  nodes: readonly GraphNode[],
  key: string | undefined,
): number[] {
  if (key == null) return [];
  const values: number[] = [];
  for (const node of nodes) {
    const v = node.metadata?.[key];
    if (typeof v === 'number') values.push(v);
  }
  return values;
}

function buildScale(
  values: number[],
  outMin: number,
  outMax: number,
): ((v: number) => number) | null {
  if (values.length === 0) return null;
  return linearScale(Math.min(...values), Math.max(...values), outMin, outMax);
}

function applyNodeMapping(
  nodes: readonly GraphNode[],
  sizeScale: ((v: number) => number) | null,
  colorScale: ((v: number) => number) | null,
  sizeKey: string | undefined,
  colorKey: string | undefined,
  colorRange: readonly [string, string],
): GraphNode[] {
  return nodes.map((node) => {
    let { width, height, style } = node;
    let changed = false;

    if (sizeScale && sizeKey != null) {
      const raw = node.metadata?.[sizeKey];
      if (typeof raw === 'number') {
        const size = sizeScale(raw);
        width = size;
        height = size;
        changed = true;
      }
    }

    if (colorScale && colorKey != null) {
      const raw = node.metadata?.[colorKey];
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

function applyEdgeWeightMapping(
  edges: readonly GraphEdge[],
  weightRange: readonly [number, number],
): GraphEdge[] {
  const weights: number[] = [];
  for (const edge of edges) {
    if (edge.weight != null) weights.push(edge.weight);
  }
  if (weights.length === 0) return edges as GraphEdge[];

  const weightScale = linearScale(
    Math.min(...weights), Math.max(...weights),
    weightRange[0], weightRange[1],
  );

  return edges.map((edge) => {
    if (edge.weight == null) return edge;
    const strokeWidth = weightScale(edge.weight);
    return { ...edge, style: { ...edge.style, strokeWidth } };
  });
}

// ---------------------------------------------------------------------------
// Pure function (useDataMapping の useMemo 計算を純関数化)
// ---------------------------------------------------------------------------

/**
 * metadata / weight の数値を視覚属性（サイズ・色・線幅）にマッピングする純関数。
 * useDataMapping の useMemo 相当を React 非依存で提供する。
 *
 * @param nodes  マッピング対象のノード一覧
 * @param edges  マッピング対象のエッジ一覧
 * @param config マッピング設定。未指定の場合は nodes/edges をそのまま返す
 */
export function applyDataMapping(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  config?: DataMappingConfig,
): MappedResult {
  const hasSizeMapping = config?.sizeKey != null;
  const hasColorMapping = config?.colorKey != null;
  const hasWeightMapping = edges.some((e) => e.weight != null);

  if (!hasSizeMapping && !hasColorMapping && !hasWeightMapping) {
    return { nodes, edges };
  }

  const sizeRange = config?.sizeRange ?? DEFAULT_DATA_MAPPING.sizeRange ?? ([60, 200] as const);
  const colorRange = config?.colorRange ?? DEFAULT_DATA_MAPPING.colorRange ?? (['#c6dbef', '#08519c'] as const);
  const weightRange = config?.weightRange ?? DEFAULT_DATA_MAPPING.weightRange ?? ([1, 8] as const);

  let mappedNodes: GraphNode[] = nodes as GraphNode[];
  if (hasSizeMapping || hasColorMapping) {
    const sizeScale = buildScale(collectMetadataValues(nodes, config?.sizeKey), sizeRange[0], sizeRange[1]);
    const colorScale = buildScale(collectMetadataValues(nodes, config?.colorKey), 0, 1);
    mappedNodes = applyNodeMapping(nodes, sizeScale, colorScale, config?.sizeKey, config?.colorKey, colorRange);
  }

  const mappedEdges = hasWeightMapping
    ? applyEdgeWeightMapping(edges, weightRange)
    : edges as GraphEdge[];

  return { nodes: mappedNodes, edges: mappedEdges };
}
