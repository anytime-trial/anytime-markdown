import type { GraphEdge, GraphNode } from '../types';
import type { NodeFilterConfig, RangeFilter, TextFilter } from '../types/nodeFilter';

export type { NodeFilterConfig, RangeFilter, TextFilter };

export interface FilteredResult {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly hiddenNodeIds: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers (元 useNodeFilter の private 関数と同一ロジック)
// ---------------------------------------------------------------------------

function passesRangeFilters(
  meta: Record<string, unknown>,
  filters: readonly RangeFilter[],
): boolean {
  for (const rf of filters) {
    const val = meta[rf.key];
    if (typeof val !== 'number') return false;
    if (rf.min != null && val < rf.min) return false;
    if (rf.max != null && val > rf.max) return false;
  }
  return true;
}

function passesTextFilters(
  meta: Record<string, unknown>,
  filters: readonly TextFilter[],
): boolean {
  for (const tf of filters) {
    const val = meta[tf.key];
    if (typeof val !== 'string') return false;
    if (!val.toLowerCase().includes(tf.value.toLowerCase())) return false;
  }
  return true;
}

function isNodeVisible(
  meta: Record<string, unknown> | undefined,
  config: NodeFilterConfig,
): boolean {
  const hasFilters = config.rangeFilters.length > 0 || config.textFilters.length > 0;
  if (!meta) return !hasFilters;
  return passesRangeFilters(meta, config.rangeFilters) && passesTextFilters(meta, config.textFilters);
}

// ---------------------------------------------------------------------------
// Pure function (useMemo 相当を純関数化)
// ---------------------------------------------------------------------------

/**
 * useNodeFilter の useMemo 計算を React 非依存の純関数として抽出。
 *
 * @param nodes  フィルタ対象のノード一覧
 * @param edges  フィルタ対象のエッジ一覧
 * @param config フィルタ設定。未指定または空フィルタのときはそのまま返す
 */
export function applyNodeFilter(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  config?: NodeFilterConfig,
): FilteredResult {
  if (!config || (config.rangeFilters.length === 0 && config.textFilters.length === 0)) {
    return { nodes: [...nodes], edges: [...edges], hiddenNodeIds: new Set() };
  }

  const hiddenNodeIds = new Set<string>();

  const filteredNodes = nodes.filter(node => {
    const visible = isNodeVisible(node.metadata, config);
    if (!visible) { hiddenNodeIds.add(node.id); }
    return visible;
  });

  const filteredEdges = edges.filter(edge => {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    return !(fromId && hiddenNodeIds.has(fromId)) && !(toId && hiddenNodeIds.has(toId));
  });

  return { nodes: filteredNodes, edges: filteredEdges, hiddenNodeIds };
}
