import { build } from 'esbuild';

// 配布用 Web Component バンドル（rich: mermaid/katex/plantuml/math/embed 対応）。
// エントリは customElements.define を含む src/element.ts。
//
// rich は ESM のみ配布する。重量 peer（mermaid / katex / mathjs / plantuml-encoder /
// jsxgraph / plotly）を external とし、consumer/CDN 側が import map 等で解決する想定。
// 自己完結 IIFE（<script> 単体）を作らない理由: katex の CSS が同梱フォント（woff2/ttf）を
// 参照し単一 IIFE への内包が非現実的なため。素の <script> 用途は基底
// `anytime-markdown-editor`（markdown-viewer の IIFE）が担う。

const HEAVY_PEERS = [
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
  entryPoints: ['src/element.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2023',
  sourcemap: false,
  loader: { '.md': 'text' },
  external: HEAVY_PEERS,
  outfile: 'dist/anytime-markdown-rich-editor.js',
});
