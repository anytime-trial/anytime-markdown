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
