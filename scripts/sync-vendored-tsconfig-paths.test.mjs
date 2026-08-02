// sync-vendored-tsconfig-paths.mjs のテスト。
// 「合格すること」より「壊したときに落ちること」を主眼に置く。このゲートは
// paths ブロックを丸ごと再構成するため、consumer 自身のパッケージを vendored と
// 誤分類すると **その paths を静かに削り取る**。削られた状態でも --check は
// 「in sync」を返すので、ゲート自体は永久に緑のまま next build だけが壊れる。
//
// 実績: markdown-viewer → markdown-editor / markdown-rich → markdown-rich-editor
// の改名にスクリプトの除外リストが追従せず、web-app の paths 4 件が消えた。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const scriptPath = fileURLToPath(new URL('./sync-vendored-tsconfig-paths.mjs', import.meta.url));
const repoRoot = dirname(dirname(scriptPath));

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** consumer 自身の依存として保持されなければならない paths。vendored tiptap ではない。 */
const CONSUMER_OWNED = [
  '@anytime-markdown/markdown-editor',
  '@anytime-markdown/markdown-editor/internal/*',
  '@anytime-markdown/markdown-rich-editor',
  '@anytime-markdown/markdown-rich-editor/src/*',
  '@anytime-markdown/markdown-engine',
];

function writeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-vendored-'));
  roots.push(root);
  const tsconfigPath = join(root, 'tsconfig.json');
  const paths = Object.fromEntries(CONSUMER_OWNED.map((k) => [k, ['../placeholder/src/index.ts']]));
  writeFileSync(
    tsconfigPath,
    JSON.stringify({ compilerOptions: { paths } }, null, 2).replace(/\n/g, '\n') + '\n',
  );
  return tsconfigPath;
}

function run(tsconfigPath, mode) {
  return execFileSync(process.execPath, [scriptPath, mode, '--tsconfig', tsconfigPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe('sync-vendored-tsconfig-paths', () => {
  it('consumer 自身の markdown-* paths を --write で削らない', () => {
    const tsconfigPath = writeFixture();
    run(tsconfigPath, '--write');
    const after = readFileSync(tsconfigPath, 'utf8');
    for (const key of CONSUMER_OWNED) {
      assert.ok(after.includes(`"${key}"`), `${key} が vendored と誤分類されて削られた`);
    }
  });

  it('vendored の paths を実際に書き出す', () => {
    const tsconfigPath = writeFixture();
    const out = run(tsconfigPath, '--write');
    const written = Number(/wrote (\d+) vendored paths/.exec(out)?.[1] ?? 0);
    // 0 件なら「何も vendored と判定していない」= 除外が広すぎる状態でも上のテストは
    // 通ってしまう。下限を置いて fail-open を塞ぐ。
    assert.ok(written > 10, `vendored paths が ${written} 件しか出ていない`);
  });

  it('--write 後は --check が in sync を返す', () => {
    const tsconfigPath = writeFixture();
    run(tsconfigPath, '--write');
    const out = run(tsconfigPath, '--check');
    assert.match(out, /in sync/);
  });
});
