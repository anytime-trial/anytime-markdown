import { build } from 'esbuild';

// 配布用 Web Component バンドル。エントリは customElements.define を含む src/element.ts。
// spreadsheet-core を内包（external にしない）。React/MUI は元々含まれない。

const common = {
  entryPoints: ['src/element.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
};

await build({ ...common, format: 'esm', outfile: 'dist/anytime-spreadsheet.js' });
await build({ ...common, format: 'iife', outfile: 'dist/anytime-spreadsheet.iife.js' });
