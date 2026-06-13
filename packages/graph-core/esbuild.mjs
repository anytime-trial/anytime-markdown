import { build } from 'esbuild';

// 配布用 Web Component バンドル。エントリは customElements.define を含む src/element.ts。
// element.ts → AnytimeGraphElement → GraphView（viewer）のみに依存し、React/MUI は含まれない。

const common = {
  entryPoints: ['src/element.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
};

await build({ ...common, format: 'esm', outfile: 'dist/anytime-graph.js' });
await build({ ...common, format: 'iife', outfile: 'dist/anytime-graph.iife.js' });
