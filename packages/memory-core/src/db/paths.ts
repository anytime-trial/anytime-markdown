import * as path from 'path';

/**
 * memory-core.db の解決パスを返す。
 *
 * 優先順位:
 * 1. `MEMORY_CORE_DB_PATH` 環境変数
 * 2. `<workspaceRoot>/.anytime/db/memory-core.db`（workspaceRoot 未指定時は `process.cwd()`）
 */
export function getMemoryCoreDbPath(workspaceRoot?: string): string {
  if (process.env.MEMORY_CORE_DB_PATH) return process.env.MEMORY_CORE_DB_PATH;
  const root = workspaceRoot ?? process.cwd();
  return path.join(root, '.anytime', 'db', 'memory-core.db');
}
