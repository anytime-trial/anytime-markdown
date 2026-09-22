import { readFile } from 'node:fs/promises';

import { build } from 'esbuild';

// 配布用 Web Component バンドル。エントリは customElements.define を含む src/element.ts。
// diagram-core / ui-core を内包する（peer が無いため external なし。cooccurrence-viewer と同方針）。
//
// cooccurrence-viewer と違い、レイアウトワーカーの内包は要らない（この viewer はワーカーを
// 使っていない）。three.js に相当する重量級の依存も持たないため、バンドルは桁が 1 つ小さい。

const common = {
  entryPoints: ['src/element.ts'],
  bundle: true,
  target: 'es2023',
  sourcemap: false,
};

await build({ ...common, format: 'esm', outfile: 'dist/anytime-diagram-viewer.js' });
await build({ ...common, format: 'iife', outfile: 'dist/anytime-diagram-viewer.iife.js' });

// 登録の事後検証。`element.ts` の登録が副作用として落ちても esbuild は成功し、タグが
// 一度も定義されないバンドルが配られる。読み込んでも何も起きない（=「置いたのに出ない」）
// という、正常系と見分けのつかない形で壊れるため、印を置いて fail させる。
const MARKER = "customElements.define(\"anytime-diagram-viewer\"";
for (const outfile of ['dist/anytime-diagram-viewer.js', 'dist/anytime-diagram-viewer.iife.js']) {
  const text = await readFile(outfile, 'utf8');
  if (!text.includes(MARKER)) {
    throw new Error(`custom element registration is missing from ${outfile}`);
  }
}
