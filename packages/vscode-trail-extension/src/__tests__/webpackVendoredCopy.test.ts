/**
 * vendored CJS を dist へ配る CopyPlugin pattern が minimizer をスキップするか。
 *
 * `npm run package` は `webpack --mode production` で走るため、CopyPlugin が emit した
 * asset も TerserPlugin を通る。bindings.js は副作用の無い `dummy.stack;` の参照で
 * `Error.prepareStackTrace` を発火させており、minify されるとその 1 行が落ちて
 * getFileName が undefined を返す → better-sqlite3 の native binary 解決が
 * `Cannot read properties of undefined (reading 'indexOf')` で必ず失敗する。
 * dev ビルドでは minify されないため再現せず、VSIX でだけ DB 機能が全滅する
 * （2026-08-20 anytime-trade 報告）。
 */
// webpack.config.js は CommonJS。型は無いので require で読む。
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const configs = require('../../webpack.config.js') as unknown;

interface CopyPattern {
  readonly from: string;
  readonly info?: { readonly minimized?: boolean };
}

function collectCopyPatterns(value: unknown): CopyPattern[] {
  const list = Array.isArray(value) ? value : [value];
  const patterns: CopyPattern[] = [];
  for (const config of list) {
    const plugins = (config as { plugins?: unknown[] }).plugins ?? [];
    for (const plugin of plugins) {
      if (plugin === null || typeof plugin !== 'object') continue;
      if (plugin.constructor?.name !== 'CopyPlugin') continue;
      patterns.push(...(((plugin as { patterns?: CopyPattern[] }).patterns ?? []) as CopyPattern[]));
    }
  }
  return patterns;
}

/**
 * node_modules のパッケージを丸ごと（= JS ごと）コピーする pattern だけを対象にする。
 *
 * 実在判定（statSync）は使わない。worktree のように node_modules を持たないチェックアウトで
 * 対象 0 件になり、検査が「違反なし」で素通りするため。単一ファイルの同梱（`*.wasm` /
 * `better_sqlite3.node`）は末尾に拡張子が付くことで区別する。
 */
function isVendoredPackageCopy(pattern: CopyPattern): boolean {
  const from = String(pattern.from).replace(/\\/g, '/');
  if (!from.includes('/node_modules/')) return false;
  const last = from.split('/').pop() ?? '';
  return !last.includes('.');
}

describe('CopyPlugin patterns', () => {
  const vendored = collectCopyPatterns(configs).filter(isVendoredPackageCopy);

  it('copies the vendored packages the native binary resolution needs', () => {
    // 網羅の検算。pattern が消えた/名前が変わったときに、この検査が 0 件で
    // 素通りするのを防ぐ（ゼロ件の検査は「違反なし」と区別が付かない）。
    const names = vendored.map((p) => String(p.from).replace(/\\/g, '/').split('/').pop());
    expect(names.sort()).toEqual(['better-sqlite3', 'bindings', 'file-uri-to-path']);
  });

  it.each([['better-sqlite3'], ['bindings'], ['file-uri-to-path']])(
    'marks %s as already-minimized so the production build does not minify it',
    (name) => {
      const pattern = vendored.find((p) => String(p.from).replace(/\\/g, '/').endsWith(`/${name}`));
      expect(pattern?.info?.minimized).toBe(true);
    },
  );
});
