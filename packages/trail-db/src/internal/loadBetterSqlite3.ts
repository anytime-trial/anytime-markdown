import fs from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';

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

/**
 * CopyWebpackPlugin が配置した `dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
 * の絶対パス。実在しなければ null（テスト・ソース実行では bindings の通常解決に任せる）。
 */
export function resolveBundledNativeBinding(distPath: string | null | undefined): string | null {
  if (distPath === null || distPath === undefined || distPath === '') return null;
  const nativeBinding = path.join(
    distPath,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  );
  return fs.existsSync(nativeBinding) ? nativeBinding : null;
}

export interface OpenBetterSqlite3Options {
  /**
   * 拡張の dist ディレクトリ。バンドル済み native binary の解決に使う。
   * 未指定（ソース実行・テスト）では bindings の通常解決に委ねる。
   */
  readonly distPath?: string | null;
}

/**
 * trail-db が better-sqlite3 の接続を開く唯一の入口。
 *
 * Why not クラスごとに `new Ctor(...)` を書く: webpack-bundled 環境では bindings package の
 * getFileName が call stack から .node のパスを推測する処理が壊れ（1 つのバンドル JS から
 * 呼ばれるため module path を判別できない）、`Cannot read properties of undefined
 * (reading 'indexOf')` で必ず throw する。この手当てをクラスごとに書き写す設計だと、
 * 1 クラス落ちただけでその機能が配布物でだけ丸ごと死ぬ（2026-08-08: FlightRecordDatabase が
 * これを欠き、Flight Record 系エンドポイントが 0.43.0 で全滅した）。入口を 1 つにして
 * 「新しいクラスが手当てを忘れられる」状態そのものを無くす。
 */
export function openBetterSqlite3(
  filePath: string,
  options: OpenBetterSqlite3Options = {},
): BetterSqlite3Database {
  const Ctor = loadBetterSqlite3();
  const nativeBinding = resolveBundledNativeBinding(options.distPath);
  return nativeBinding === null ? new Ctor(filePath) : new Ctor(filePath, { nativeBinding });
}
