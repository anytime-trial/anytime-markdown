import * as path from 'node:path';

/**
 * 検索側（mcp-markdown）と ingest 側で一致させる doc-core.db パス解決。
 * 既定 `<workspace>/.anytime/markdown/doc-core.db`。
 * doc-core を import しない軽量モジュール（extension.js / provider から参照するため）。
 */
export function resolveDocDbPath(workspaceRoot: string, configured?: string): string {
  const c = configured?.trim();
  if (c) return c;
  return path.join(workspaceRoot, '.anytime', 'markdown', 'doc-core.db');
}
