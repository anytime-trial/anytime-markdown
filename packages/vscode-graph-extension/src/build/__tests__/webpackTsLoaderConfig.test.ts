import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * ts-loader の `configFile` がファイル名だけだと、**読み込むファイルのディレクトリから
 * 親方向へ探索される**。他パッケージのファイルをエントリに持つと（graph 拡張の webview は
 * `../cooccurrence-viewer/src/worker/layoutWorker.ts` を束ねる）、そのパッケージには
 * 目的の tsconfig が無いためリポジトリルートの `tsconfig.json` へ到達し、
 * `TS18002: The 'files' list in config file 'tsconfig.json' is empty.` で落ちる。
 *
 * ts-loader のインスタンスは同一 options で共有され、最初に解決した config を使い回すため、
 * エントリの処理順によって落ちたり通ったりする（実測で 3 回に 1 回程度）。ビルドを 1 回
 * 通しただけでは検知できない。ここでは探索そのものを禁じ、絶対パス指定を機械的に固定する。
 *
 * 検査対象はリポジトリ内の全 `webpack.config.js`。同じ罠は今後どのパッケージでも踏みうる。
 */

const PACKAGES_DIR = join(__dirname, '../../../..');

function webpackConfigPaths(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name, 'webpack.config.js'))
    .filter((path) => existsSync(path));
}

/** `configFile: <値>` の値をソースから抜き出す。 */
function configFileValues(source: string): string[] {
  return [...source.matchAll(/configFile:\s*([^,\n]+)/g)].map((match) => match[1]!.trim());
}

describe('webpack の ts-loader configFile', () => {
  const paths = webpackConfigPaths();

  // ガード: 収集が空振りすると以下の検査が「対象ゼロで全部 pass」になる。
  it('collects the webpack configs to inspect', () => {
    expect(paths.length).toBeGreaterThanOrEqual(5);
    expect(paths.some((path) => path.includes('vscode-graph-extension'))).toBe(true);
  });

  it.each(paths.map((path) => [path.replace(`${PACKAGES_DIR}/`, ''), path]))(
    '%s は configFile を親方向の探索に委ねない',
    (_label, path) => {
      const values = configFileValues(readFileSync(path, 'utf8'));
      for (const value of values) {
        // 文字列リテラル（'tsconfig.webview.json' 等）はファイル名指定＝探索に落ちる。
        // path.resolve(...) のような式であることを求める。
        expect(value).toMatch(/^path\.(resolve|join)\(/);
      }
    },
  );

  it('graph 拡張の webview が指す tsconfig が実在する', () => {
    // 絶対パス化しても、指す先が無ければ同じ探索フォールバックへ落ちる。
    const source = readFileSync(join(PACKAGES_DIR, 'vscode-graph-extension/webpack.config.js'), 'utf8');
    const literals = [...source.matchAll(/path\.resolve\(__dirname,\s*'([^']+)'\)/g)].map((match) => match[1]!);
    expect(literals).toContain('tsconfig.webview.json');
    for (const literal of literals) {
      const resolved = join(PACKAGES_DIR, 'vscode-graph-extension', literal);
      expect(isAbsolute(resolved)).toBe(true);
      expect(existsSync(resolved)).toBe(true);
    }
  });
});
