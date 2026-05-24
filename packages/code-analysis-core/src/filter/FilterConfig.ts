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

// TS/JS: foo.test.ts / foo.spec.tsx 等。Python: test_foo.py / foo_test.py（パスセグメント先頭）。
const TEST_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$|(^|\/)(test_[^/]+|[^/]+_test)\.pyi?$/;

export function applyFilter(
  nodes: readonly TrailNode[],
  edges: readonly TrailEdge[],
  config: FilterConfig,
): { nodes: TrailNode[]; edges: TrailEdge[] } {
  const filteredNodes = nodes.filter(node => {
    if (!config.includeTests && TEST_PATTERN.test(node.filePath)) {
      return false;
    }
    // Paths starting with '../' are resolved via symlinks (e.g. workspace package symlinks in
    // a git worktree) and point outside the project root. ignore() throws RangeError for such
    // paths; exclude these nodes so they don't pollute the release graph.
    if (node.filePath.startsWith('../')) {
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
