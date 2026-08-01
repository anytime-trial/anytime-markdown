import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

// 配布用 Web Component バンドル。エントリは customElements.define を含む src/element.ts。
// graph-core / three を内包する（peer が無いため external なし。markdown-viewer と同方針）。
//
// レイアウトワーカーは (1) classic worker として単独バンドル → (2) プラグインで
// src/worker/layoutWorkerCode.ts のプレースホルダを実コード文字列へ差し替える、の 2 段で内包する。
// 実行時は Blob URL からワーカーを生成する（createInlineLayoutWorker.ts）。

const workerResult = await build({
  entryPoints: ['src/worker/layoutWorker.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2023',
  write: false,
  sourcemap: false,
});
const workerCode = workerResult.outputFiles[0].text;

const injectLayoutWorkerCode = {
  name: 'inject-layout-worker-code',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /worker[\\/]layoutWorkerCode\.ts$/ }, () => ({
      contents: `export const layoutWorkerCode = ${JSON.stringify(workerCode)};`,
      loader: 'ts',
    }));
  },
};

const common = {
  entryPoints: ['src/element.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
  plugins: [injectLayoutWorkerCode],
};

await build({ ...common, format: 'esm', outfile: 'dist/anytime-cooccurrence-viewer.js' });
await build({ ...common, format: 'iife', outfile: 'dist/anytime-cooccurrence-viewer.iife.js' });

// 注入の事後検証。プラグインの filter がパス変更等で取りこぼしても esbuild は成功して
// 空のプレースホルダのまま配布され、「ワーカー生成不可 → 同期縮退」という正常系と
// 見分けのつかない劣化になる（fail-open）。ワーカー実装内の文字列を印にして fail させる。
const WORKER_MARKER = 'layout worker received an unknown message type';
if (!workerCode.includes(WORKER_MARKER)) {
  throw new Error('layout worker bundle does not contain the expected marker');
}
for (const outfile of ['dist/anytime-cooccurrence-viewer.js', 'dist/anytime-cooccurrence-viewer.iife.js']) {
  const text = await readFile(outfile, 'utf8');
  if (!text.includes(WORKER_MARKER)) {
    throw new Error(`layout worker code was not injected into ${outfile}`);
  }
}
