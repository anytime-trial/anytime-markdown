import type { TrailNode } from '../../model/types';

export type CallHierarchyScope = 'project' | 'package' | 'file';

export interface CallHierarchyFilterOptions {
  readonly scope: CallHierarchyScope;
  readonly excludeTests: boolean;
  readonly rootFilePath: string;
}

/**
 * scope と excludeTests から TrailNode 用の filter 関数を構築する。
 * 戻り値 undefined は「フィルタ不要 (全ノード対象)」を示す。
 *
 * - scope='project': 全パッケージ対象
 * - scope='package': ルートと同じ `packages/<name>/` プレフィックスのみ
 *   (ルートが `packages/*` に属さない場合は全ノード対象として扱う)
 * - scope='file':    ルートと同一 filePath のみ
 * - excludeTests=true: `*.test.*` / `*.spec.*` / `__tests__/` を含むノードを除外
 */
export function buildCallHierarchyNodeFilter(
  opts: CallHierarchyFilterOptions,
): ((node: TrailNode) => boolean) | undefined {
  const { scope, excludeTests, rootFilePath } = opts;
  if (scope === 'project' && !excludeTests) return undefined;

  const packagePrefix = scope === 'package' ? getPackagePrefix(rootFilePath) : '';

  return (node: TrailNode): boolean => {
    if (excludeTests && isTestFilePath(node.filePath)) return false;
    if (scope === 'file' && node.filePath !== rootFilePath) return false;
    if (scope === 'package' && packagePrefix && !node.filePath.startsWith(packagePrefix)) return false;
    return true;
  };
}

export function getPackagePrefix(filePath: string): string {
  const m = /^(packages\/[^/]+\/)/.exec(filePath);
  return m ? m[1] : '';
}

export function isTestFilePath(filePath: string): boolean {
  if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(filePath)) return true;
  if (filePath.includes('__tests__/')) return true;
  return false;
}
