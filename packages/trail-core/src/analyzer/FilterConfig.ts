import type { Ignore } from 'ignore';
import type { TrailNode, TrailEdge } from '../model/types';

export interface FilterConfig {
  /**
   * `.gitignore` 互換の Ignore インスタンス。`ignores(filePath)` が true を返した
   * ノードは除外される。空 Ignore（何も add していない）は何もマッチしない。
   */
  readonly exclude: Ignore;
  readonly includeTests: boolean;
}

const TEST_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

export function applyFilter(
  nodes: readonly TrailNode[],
  edges: readonly TrailEdge[],
  config: FilterConfig,
): { nodes: TrailNode[]; edges: TrailEdge[] } {
  const filteredNodes = nodes.filter(node => {
    if (!config.includeTests && TEST_PATTERN.test(node.filePath)) {
      return false;
    }
    if (node.filePath !== '' && config.exclude.ignores(node.filePath)) {
      return false;
    }
    return true;
  });

  const nodeIds = new Set(filteredNodes.map(n => n.id));

  const filteredEdges = edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { nodes: [...filteredNodes], edges: [...filteredEdges] };
}
