import { copyFileSync, mkdirSync } from 'node:fs';

import { build } from 'esbuild';

// lean read-only viewer の配布バンドル。図表（mermaid/katex 等）は含まない。
// 内部 @anytime-markdown/* は同梱。peer の dompurify/diff は ESM では external、
// IIFE（<script> 単体）では内包する。
const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
  loader: { '.md': 'text' },
};

await build({ ...common, format: 'esm', external: ['dompurify', 'diff'], outfile: 'dist/markdown-view-lite.js' });
await build({ ...common, format: 'iife', external: [], outfile: 'dist/markdown-view-lite.iife.js' });

// 手書きの公開型宣言（追跡対象の src）を dist へコピーする。dist は gitignore のため
// 型宣言を src に置き、ビルドで配布物へ複製する（clean clone でも型が欠落しない）。
mkdirSync('dist', { recursive: true });
copyFileSync('src/index.d.ts', 'dist/index.d.ts');
