import type { TrailNode, TrailEdge } from '../model/types';

export interface FilterConfig {
  readonly exclude: readonly string[];
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
    for (const pattern of config.exclude) {
      if (matchGlob(node.filePath, pattern)) {
        return false;
      }
    }
    return true;
  });

  const nodeIds = new Set(filteredNodes.map(n => n.id));

  const filteredEdges = edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { nodes: [...filteredNodes], edges: [...filteredEdges] };
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replaceAll('**', '\0')
    .replaceAll('*', '[^/]*')
    .replaceAll('\0', '.*');
  return new RegExp(`^${regex}$`).test(filePath);
}
