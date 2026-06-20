/**
 * doc-core.db の物理パス解決。memory-core と同じ TRAIL_HOME 規約に揃える。
 */

import * as path from 'node:path';

const PROTECTED_FALLBACK_PATTERNS = [/\/vscode-server\//, /\/vscode\/vscode-server\b/, /\/\.vscode\b/];

function assertSafeRoot(root: string): void {
  if (PROTECTED_FALLBACK_PATTERNS.some((p) => p.test(root))) {
    throw new Error(
      `[doc-core] refusing to fall back to protected path "${root}". ` +
        `Pass workspaceRoot explicitly or set TRAIL_HOME.`,
    );
  }
}

/**
 * TRAIL_HOME（daemon ランタイムルート）を解決する。
 * 優先: `TRAIL_HOME` env → `<workspaceRoot>/.anytime/trail`（未指定時 cwd フォールバック・保護領域なら throw）。
 */
export function getTrailHome(workspaceRoot?: string): string {
  if (process.env.TRAIL_HOME) return process.env.TRAIL_HOME;
  const root = workspaceRoot ?? process.cwd();
  if (!workspaceRoot) assertSafeRoot(root);
  return path.join(root, '.anytime', 'trail');
}

/** `${TRAIL_HOME}/db/doc-core.db` を返す。テストは openDocDb に任意パスを直接渡す。 */
export function getDocCoreDbPath(workspaceRoot?: string): string {
  return path.join(getTrailHome(workspaceRoot), 'db', 'doc-core.db');
}
