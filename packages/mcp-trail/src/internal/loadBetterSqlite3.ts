import * as fs from 'node:fs';
import * as path from 'node:path';

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
 * export しないのは、`const Ctor = loadBetterSqlite3(); new Ctor(p)` という書き方が
 * コピー元として目に入ると nativeBinding の手当てごと落ちるため（trail-db の同名関数と
 * 同じ方針）。接続を開く経路は `openBetterSqlite3` に限る。
 */
function loadBetterSqlite3(): typeof BetterSqlite3 {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cached = require('better-sqlite3') as typeof BetterSqlite3;
  return cached;
}

/** CopyWebpackPlugin が dist 配下へ配置する native binary の相対位置。 */
const BUNDLED_BINDING_SEGMENTS = [
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
] as const;

/**
 * バンドル済み `better_sqlite3.node` の絶対パス。実在しなければ null
 * （ソース実行・テストでは bindings の通常解決に任せる）。
 *
 * 既定の基点は `__dirname`。バンドル後は webpack config の `node.__dirname = false`
 * により実行時の値（= 拡張の `dist/`）がそのまま残るため、呼び出し側から distPath を
 * 注入しなくても解決できる。trail-db 側は distPath を引数で受け取る形だが、その設計は
 * 「渡し忘れた新クラスが配布物でだけ死ぬ」上限を持つ（trail-db の同名関数のコメント参照）。
 * mcp-trail はエントリが 2 つ（stdio / mcp-trail-entry）あり注入経路を増やしたくないので、
 * 基点の自己解決を既定にしてテストだけが `baseDir` を上書きする。
 */
export function resolveBundledNativeBinding(baseDir: string = __dirname): string | null {
  if (baseDir === '') return null;
  const nativeBinding = path.join(baseDir, ...BUNDLED_BINDING_SEGMENTS);
  return fs.existsSync(nativeBinding) ? nativeBinding : null;
}

export interface OpenBetterSqlite3Options {
  /** 読み取り専用で開く（better-sqlite3 の同名オプションをそのまま透過する）。 */
  readonly readonly?: boolean;
  /**
   * バンドル済み native binary を探す基点。既定は `__dirname`
   * （バンドル後は拡張の `dist/`）。テストが dist レイアウトを模すためだけに上書きする。
   */
  readonly baseDir?: string;
}

/**
 * mcp-trail が better-sqlite3 の接続を開く唯一の入口。
 *
 * Why not `new Ctor(dbPath)` と直接書く: better-sqlite3 は native binary の解決を
 * `bindings` パッケージへ委ねており、`bindings` は `Error.prepareStackTrace` を差し替えて
 * 呼び出し元のファイル名をスタックから取り出す。この処理は VSIX ビルド（`--mode production`）で
 * CopyPlugin 経由の bindings.js が minify されると壊れ、`Cannot read properties of undefined
 * (reading 'indexOf')` で**必ず** throw する。ソース実行・jest・tsc・webpack build はすべて
 * 緑のまま通り、配布物でだけ DB 系ツールが全滅する（2026-08-20 に anytime-trade から報告。
 * mcp-logs の記録が残る全期間で成功 0 件）。
 *
 * minify 側は webpack config の `KEEP_VENDORED_CJS_UNMINIFIED` で塞いだが、`bindings` の
 * スタック探索そのものがバンドル環境で壊れやすいことは変わらないため、解決経路を通らない
 * `nativeBinding` 明示を第 2 の防御として置く。
 */
export function openBetterSqlite3(
  filePath: string,
  options: OpenBetterSqlite3Options = {},
): BetterSqlite3Database {
  const Ctor = loadBetterSqlite3();
  const { readonly, baseDir } = options;
  const nativeBinding = resolveBundledNativeBinding(baseDir);
  return new Ctor(filePath, {
    ...(nativeBinding === null ? {} : { nativeBinding }),
    ...(readonly === true ? { readonly: true } : {}),
  });
}
