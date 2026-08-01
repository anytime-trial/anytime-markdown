import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, parseArgs, selectDistFiles } from './export-viewer-dist.mjs';

test('parseArgs: --out は必須で、省略時は usage エラーを投げる', () => {
  assert.throws(() => parseArgs([]), /--out/);
  assert.throws(() => parseArgs(['--package', 'markdown-viewer']), /--out/);
});

test('parseArgs: --package 省略時は cooccurrence-viewer', () => {
  assert.deepEqual(parseArgs(['--out', '/tmp/handoff']), {
    outDir: '/tmp/handoff',
    packageName: 'cooccurrence-viewer',
  });
});

test('parseArgs: --package 指定を受け取る', () => {
  assert.deepEqual(parseArgs(['--out', '/tmp/handoff', '--package', 'markdown-viewer']), {
    outDir: '/tmp/handoff',
    packageName: 'markdown-viewer',
  });
});

test('parseArgs: 値の無いフラグ・未知の引数はエラー', () => {
  assert.throws(() => parseArgs(['--out']), /--out/);
  assert.throws(() => parseArgs(['--out', '/tmp/x', '--package']), /--package/);
  assert.throws(() => parseArgs(['--out', '/tmp/x', 'extra']), /unknown/i);
});

test('parseArgs: パッケージ名にパス区切りを含めない（packages/ 外への解決を防ぐ）', () => {
  assert.throws(() => parseArgs(['--out', '/tmp/x', '--package', '../web-app']), /package name/i);
  assert.throws(() => parseArgs(['--out', '/tmp/x', '--package', 'a/b']), /package name/i);
});

test('selectDistFiles: .js のみを名前順で選ぶ（map やディレクトリ由来の名前は除外）', () => {
  assert.deepEqual(
    selectDistFiles(['b.iife.js', 'a.js', 'a.js.map', 'index.d.ts', 'notes.txt']),
    ['a.js', 'b.iife.js'],
  );
});

test('buildManifest: 由来（version・commit・dirty・生成時刻）とファイルの検証情報を持つ', () => {
  const manifest = buildManifest({
    packageName: 'cooccurrence-viewer',
    version: '0.1.0',
    commit: 'abc1234def',
    dirty: false,
    generatedAt: '2026-08-01T04:00:00.000Z',
    files: [{ name: 'anytime-cooccurrence-viewer.js', bytes: 1500000, sha256: 'deadbeef' }],
  });
  assert.equal(manifest.package, 'cooccurrence-viewer');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.commit, 'abc1234def');
  assert.equal(manifest.dirty, false);
  assert.equal(manifest.generatedAt, '2026-08-01T04:00:00.000Z');
  assert.deepEqual(manifest.files, [
    { name: 'anytime-cooccurrence-viewer.js', bytes: 1500000, sha256: 'deadbeef' },
  ]);
});

test('buildManifest: dirty なワークツリー由来であることを偽らない', () => {
  const manifest = buildManifest({
    packageName: 'cooccurrence-viewer',
    version: '0.1.0',
    commit: 'abc1234def',
    dirty: true,
    generatedAt: '2026-08-01T04:00:00.000Z',
    files: [],
  });
  assert.equal(manifest.dirty, true);
});
