import type { SqlJsStatic } from 'sql.js';
import type initSqlJsFn from 'sql.js';

/**
 * sql.js の SqlJsStatic を取得するためのローダ。
 *
 * VS Code 拡張は webpack バンドル後の VSIX に node_modules を同梱しないため、
 * `import 'sql.js'` を webpack に解決させると UMD wrapper が壊れて
 * `Cannot set properties of undefined (setting 'exports')` で activate に失敗する。
 *
 * 拡張側は extension activate 時に setSqlJsLoader() で `__non_webpack_require__`
 * 経由 (dist/sql-wasm.js を直接 require) のローダを inject すること。
 *
 * テスト・スクリプト・mcp-trail サブプロセスなど Node から直接 import される
 * 環境では setSqlJsLoader() を呼ばず、デフォルトの `import('sql.js')`
 * (webpackIgnore で webpack バンドル対象外) にフォールバックする。
 */

type SqlJsModuleLoader = () => Promise<SqlJsStatic>;

let override: SqlJsModuleLoader | null = null;
let cached: SqlJsStatic | null = null;

export function setSqlJsLoader(loader: SqlJsModuleLoader | null): void {
  override = loader;
  cached = null;
}

export async function loadSqlJsModule(): Promise<SqlJsStatic> {
  if (cached) return cached;
  if (override) {
    cached = await override();
    return cached;
  }
  const m = (await import(/* webpackIgnore: true */ 'sql.js')) as
    | { default: typeof initSqlJsFn }
    | typeof initSqlJsFn;
  const initSqlJs = (
    typeof m === 'function' ? m : (m as { default: typeof initSqlJsFn }).default
  ) as typeof initSqlJsFn;
  cached = await initSqlJs();
  return cached;
}
