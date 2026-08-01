import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, parseArgs, selectFreshDistFiles } from './export-viewer-dist.mjs';

test('parseArgs: --out は必須で、省略時は usage エラーを投げる', () => {
  assert.throws(() => parseArgs([]), /--out/);
  assert.throws(() => parseArgs(['--package', 'markdown-viewer']), /--out/);
});

test('parseArgs: --package 省略時は cooccurrence-viewer と markdown-viewer の両方', () => {
  assert.deepEqual(parseArgs(['--out', '/tmp/handoff']), {
    outDir: '/tmp/handoff',
    packageNames: ['cooccurrence-viewer', 'markdown-viewer'],
  });
});

test('parseArgs: --package 指定で 1 つに絞れる', () => {
  assert.deepEqual(parseArgs(['--out', '/tmp/handoff', '--package', 'markdown-viewer']), {
    outDir: '/tmp/handoff',
    packageNames: ['markdown-viewer'],
  });
});

test('parseArgs: --package は複数指定でき、重複は除く', () => {
  assert.deepEqual(
    parseArgs([
      '--out', '/tmp/handoff',
      '--package', 'markdown-viewer',
      '--package', 'cooccurrence-viewer',
      '--package', 'markdown-viewer',
    ]),
    {
      outDir: '/tmp/handoff',
      packageNames: ['markdown-viewer', 'cooccurrence-viewer'],
    },
  );
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

test('selectFreshDistFiles: .js のみを名前順で選ぶ（map や .d.ts は除外）', () => {
  const t = 1_000_000;
  assert.deepEqual(
    selectFreshDistFiles(
      [
        { name: 'b.iife.js', mtimeMs: t + 10 },
        { name: 'a.js', mtimeMs: t + 10 },
        { name: 'a.js.map', mtimeMs: t + 10 },
        { name: 'index.d.ts', mtimeMs: t + 10 },
        { name: 'notes.txt', mtimeMs: t + 10 },
      ],
      t,
    ),
    ['a.js', 'b.iife.js'],
  );
});

// 回帰テスト: markdown-viewer の dist に旧 tsc 出力（searchReplaceExtension.js 等）が
// 残っていた実例。ビルド開始時刻より古い .js は「このビルドの成果物」ではないため
// 受け渡しに含めない（含めると古い残骸が配布物の顔で相手に渡る）。
test('selectFreshDistFiles: ビルド開始時刻より古い残骸 .js を除外する', () => {
  const buildStartedAt = 1_000_000;
  assert.deepEqual(
    selectFreshDistFiles(
      [
        { name: 'anytime-markdown-editor.js', mtimeMs: buildStartedAt + 500 },
        { name: 'anytime-markdown-editor.iife.js', mtimeMs: buildStartedAt + 800 },
        { name: 'searchReplaceExtension.js', mtimeMs: buildStartedAt - 3_888_000_000 },
        { name: 'tableExtension.js', mtimeMs: buildStartedAt - 3_888_000_000 },
      ],
      buildStartedAt,
    ),
    ['anytime-markdown-editor.iife.js', 'anytime-markdown-editor.js'],
  );
});

test('selectFreshDistFiles: ビルド開始と同時刻の mtime は含める（境界は排除しない）', () => {
  const t = 1_000_000;
  assert.deepEqual(selectFreshDistFiles([{ name: 'a.js', mtimeMs: t }], t), ['a.js']);
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
