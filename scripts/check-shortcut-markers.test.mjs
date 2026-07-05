import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findViolations, scanShortcutDir } from './check-shortcut-markers.mjs';

const require = createRequire(import.meta.url);
const { collectShortcutMarkers } = require('../.claude/skills/anytime-dev-health/shortcutMarkers.cjs');

// フィクスチャ内のタグは分割構築する(このテストファイル自身が検査対象拡張子のためリテラルを含むと自己検出される)
const TAG = 'SHORT' + 'CUT';
const marker = (rest) => `// ${TAG}: ${rest}`;

test('3要素が同一行に揃ったマーカーを合格判定する', () => {
  const text = marker('グローバルロックで実装. ceiling: 単一プロセス前提. upgrade: マルチプロセス化したら分離.');
  const ms = collectShortcutMarkers(text);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].hasCeiling, true);
  assert.equal(ms[0].hasUpgrade, true);
  assert.equal(findViolations(text).length, 0);
});

test('後続コメント行へ折り返した upgrade をブロックとして判定する(check-skill-refs.mjs 実在例)', () => {
  const text = [
    marker('--workspace 付きはスキップ. ceiling: root scripts のみ照合.'),
    '// upgrade: 実害が出たら workspace 解決を実装.',
    'const x = 1;',
  ].join('\n');
  const ms = collectShortcutMarkers(text);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].hasUpgrade, true);
  assert.equal(findViolations(text).length, 0);
});

test('upgrade 欠落(no-trigger)と ceiling 欠落を欠落要素つきで検出する', () => {
  const noUpgrade = [marker('簡略化した. ceiling: 前提あり.'), 'const x = 1;'].join('\n');
  const noCeiling = [marker('簡略化した. upgrade: 条件が来たら.'), 'const y = 2;'].join('\n');
  assert.deepEqual(findViolations(noUpgrade)[0].missing, ['upgrade']);
  assert.deepEqual(findViolations(noCeiling)[0].missing, ['ceiling']);
  assert.deepEqual(findViolations(marker('内容のみ.'))[0].missing, ['ceiling', 'upgrade']);
});

test('連続する別マーカーのブロックを混同しない', () => {
  const text = [
    marker('一つ目. ceiling: A.'),
    marker('二つ目. ceiling: B. upgrade: C.'),
  ].join('\n');
  const vs = findViolations(text);
  assert.equal(vs.length, 1);
  assert.equal(vs[0].line, 1);
});

test('コメント接頭辞のない文字列リテラルはマーカー扱いしない', () => {
  const text = `const s = "${TAG}: これはコメントではない";`;
  assert.equal(collectShortcutMarkers(text).length, 0);
});

test('ディレクトリ走査が node_modules/dist を除外し violation を file:line で返す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shortcut-'));
  try {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'src', 'a.ts'), ['const a = 1;', marker('x. ceiling: y.')].join('\n'));
    writeFileSync(join(dir, 'node_modules', 'b.ts'), marker('z.'));
    writeFileSync(join(dir, 'dist', 'c.js'), marker('w.'));
    writeFileSync(join(dir, 'src', 'ok.ts'), marker('完備. ceiling: 上限. upgrade: 契機.'));
    const res = scanShortcutDir(dir);
    assert.equal(res.violations.length, 1);
    assert.equal(res.violations[0].file, join('src', 'a.ts'));
    assert.equal(res.violations[0].line, 2);
    assert.deepEqual(res.violations[0].missing, ['upgrade']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
