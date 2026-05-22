import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = join(__dirname, '..', '..');
const distDir = join(packageRoot, 'dist');

beforeAll(() => {
  // .d.ts は build 成果物（dist は gitignore）。テスト自己充足のため emit する。
  execSync('npx tsc -p tsconfig.json --emitDeclarationOnly', { cwd: packageRoot, stdio: 'pipe' });
}, 120000);

// 公開エントリ index と、それが re-export する AnytimeGraphElement の .d.ts を検査する。
// （normalizeGraphInput.d.ts は exports マップ非公開かつ index から未参照のため対象外）
it.each(['index.d.ts', 'AnytimeGraphElement.d.ts'])('公開 %s に graph-core への import が無い（自己完結）', (file) => {
  const dts = readFileSync(join(distDir, file), 'utf8');
  expect(dts).not.toMatch(/@anytime-markdown\/graph-core/);
});
