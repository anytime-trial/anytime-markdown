import { build } from 'esbuild';

// 配布用 Web Component バンドル。エントリは customElements.define を含む src/element.ts。
// markdown-core / spreadsheet-viewer を内包。React/MUI は含まれない。
// peer の dompurify / diff は consumer 提供（external）。

const common = {
  entryPoints: ['src/element.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
  // raw .md import（テンプレート/初期コンテンツ）を文字列として取り込む（webpack asset/source 相当）。
  loader: { '.md': 'text' },
  external: ['dompurify', 'diff'],
};

await build({ ...common, format: 'esm', outfile: 'dist/anytime-markdown-editor.js' });
await build({
  ...common,
  format: 'iife',
  // IIFE は単体 <script> 利用のため peer も内包する（external にしない）。
  external: [],
  outfile: 'dist/anytime-markdown-editor.iife.js',
});
