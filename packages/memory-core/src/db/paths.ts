import * as path from 'path';

/**
 * memory-core.db の解決パスを返す。
 *
 * 優先順位:
 * 1. `MEMORY_CORE_DB_PATH` 環境変数
 * 2. `<workspaceRoot>/.anytime/db/memory-core.db`（workspaceRoot 未指定時は `process.cwd()` フォールバック）
 *
 * VS Code 拡張のように `process.cwd()` が保護された領域（VS Code Server バイナリパス等）を
 * 返す可能性がある実行コンテキストでは、必ず `workspaceRoot` を明示すること。
 * フォールバックが保護領域を指していた場合は Error を throw する。
 */
const PROTECTED_FALLBACK_PATTERNS = [
  /\/vscode-server\//,
  /\/vscode\/vscode-server\b/,
  /\/\.vscode\b/,
];

export function getMemoryCoreDbPath(workspaceRoot?: string): string {
  if (process.env.MEMORY_CORE_DB_PATH) return process.env.MEMORY_CORE_DB_PATH;
  const root = workspaceRoot ?? process.cwd();
  if (!workspaceRoot && PROTECTED_FALLBACK_PATTERNS.some((p) => p.test(root))) {
    throw new Error(
      `[memory-core] getMemoryCoreDbPath: refusing to fall back to protected path "${root}". ` +
        `Caller must pass workspaceRoot explicitly or set MEMORY_CORE_DB_PATH.`,
    );
  }
  return path.join(root, '.anytime', 'db', 'memory-core.db');
}
