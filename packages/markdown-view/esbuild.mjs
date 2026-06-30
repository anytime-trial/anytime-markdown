import { copyFileSync, mkdirSync } from 'node:fs';

import { build } from 'esbuild';

// figure 同梱 read-only viewer の配布バンドル（ESM のみ）。
// 内部 @anytime-markdown/* は同梱。図表 heavy lib は external（提供先 bundler が解決）。
// IIFE は katex の同梱フォント（woff2/ttf）参照のため作らない。
const HEAVY = [
  'dompurify',
  'diff',
  'mermaid',
  'katex',
  'mathjs',
  'plantuml-encoder',
  'jsxgraph',
  'plotly.js-gl3d-dist-min',
  'next-intl',
];

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2023',
  sourcemap: false,
  loader: { '.md': 'text' },
  external: HEAVY,
  outfile: 'dist/markdown-view.js',
});

// 手書きの公開型宣言（追跡対象の src）を dist へコピーする。dist は gitignore のため
// 型宣言を src に置き、ビルドで配布物へ複製する（clean clone でも型が欠落しない）。
mkdirSync('dist', { recursive: true });
copyFileSync('src/index.d.ts', 'dist/index.d.ts');
