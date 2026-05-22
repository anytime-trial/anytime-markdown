import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2023',
  outfile: 'dist/anytime-graph.js',
  sourcemap: true,
  // graph-core を内包（external にしない）。React は元々含まれない。
});

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2023',
  outfile: 'dist/anytime-graph.iife.js',
  sourcemap: true,
});
