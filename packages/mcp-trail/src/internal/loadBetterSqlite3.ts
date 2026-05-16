import type BetterSqlite3 from 'better-sqlite3';

let cached: typeof BetterSqlite3 | null = null;

/**
 * better-sqlite3 を遅延 require する。
 *
 * VS Code 拡張のような webpack bundle 環境では、`import` で書くと bundle 時に
 * native binary をいじろうとして失敗するため、関数内で遅延 require する。
 * webpack config 側で `'better-sqlite3': 'commonjs better-sqlite3'` を
 * externals 指定しておくことで、bundle 後の `require('better-sqlite3')` が
 * `dist/node_modules/better-sqlite3/` を解決する。
 *
 * memory-core の同名関数と同じパターン。
 */
export function loadBetterSqlite3(): typeof BetterSqlite3 {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cached = require('better-sqlite3') as typeof BetterSqlite3;
  return cached;
}
