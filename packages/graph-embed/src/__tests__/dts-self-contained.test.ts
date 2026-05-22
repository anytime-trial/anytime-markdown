import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(__dirname, '..', '..', 'dist');

// 公開エントリ index と、それが re-export する AnytimeGraphElement の .d.ts を検査する。
// （normalizeGraphInput.d.ts は exports マップ非公開かつ index から未参照のため対象外）
it.each(['index.d.ts', 'AnytimeGraphElement.d.ts'])('公開 %s に graph-core への import が無い（自己完結）', (file) => {
  const dts = readFileSync(join(distDir, file), 'utf8');
  expect(dts).not.toMatch(/@anytime-markdown\/graph-core/);
});
