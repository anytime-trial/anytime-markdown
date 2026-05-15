import * as path from 'path';

const PROTECTED_FALLBACK_PATTERNS = [
  /\/vscode-server\//,
  /\/vscode\/vscode-server\b/,
  /\/\.vscode\b/,
];

function assertSafeRoot(root: string, varName: string, label: string): void {
  if (PROTECTED_FALLBACK_PATTERNS.some((p) => p.test(root))) {
    throw new Error(
      `[memory-core] ${label}: refusing to fall back to protected path "${root}". ` +
        `Caller must pass workspaceRoot explicitly or set ${varName}.`,
    );
  }
}

/**
 * TRAIL_HOME (= daemon runtime ルート) を解決する。
 *
 * 優先順位:
 * 1. `TRAIL_HOME` 環境変数
 * 2. `<workspaceRoot>/.anytime/trail`（workspaceRoot 未指定時は `process.cwd()` フォールバック）
 *
 * workspaceRoot 未指定でフォールバック先が VS Code Server バイナリパス等の保護領域だった場合は throw する。
 */
export function getTrailHome(workspaceRoot?: string): string {
  if (process.env.TRAIL_HOME) return process.env.TRAIL_HOME;
  const root = workspaceRoot ?? process.cwd();
  if (!workspaceRoot) assertSafeRoot(root, 'TRAIL_HOME', 'getTrailHome');
  return path.join(root, '.anytime', 'trail');
}

/**
 * memory-core.db の解決パスを返す。
 *
 * 優先順位:
 * 1. `MEMORY_CORE_DB_PATH` 環境変数
 * 2. `${TRAIL_HOME}/db/memory-core.db`（= `<workspaceRoot>/.anytime/trail/db/memory-core.db`）
 *
 * workspaceRoot 未指定でフォールバック先が保護領域だった場合は throw する。
 */
export function getMemoryCoreDbPath(workspaceRoot?: string): string {
  if (process.env.MEMORY_CORE_DB_PATH) return process.env.MEMORY_CORE_DB_PATH;
  return path.join(getTrailHome(workspaceRoot), 'db', 'memory-core.db');
}
