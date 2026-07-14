import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  encodeProjectDir,
  parseMemory,
  detectDanglingClusters,
  findUncoveredBugFiles,
  scanMemoryDir,
// git 正本(packages 側)から読む。.claude/skills/ は .gitignore された実行時コピーで CI には存在しない。
} = require('../packages/vscode-trail-extension/skills/anytime-dev-retro/recurrence.cjs');

const memoryMd = (name, type, body) =>
  `---\nname: ${name}\ndescription: d\nmetadata:\n  type: ${type}\n---\n\n${body}\n`;

test('encodeProjectDir が cwd をメモリ格納ディレクトリ名へ変換する', () => {
  assert.equal(encodeProjectDir('/anytime-markdown'), '-anytime-markdown');
  assert.equal(encodeProjectDir('/home/user/my.repo'), '-home-user-my-repo');
});

test('parseMemory が frontmatter name/type と本文 [[リンク]] を抽出する', () => {
  const m = parseMemory(memoryMd('foo-bar', 'feedback', 'text [[link-a]] and [[link-b]].'));
  assert.equal(m.name, 'foo-bar');
  assert.equal(m.type, 'feedback');
  assert.deepEqual(m.links, ['link-a', 'link-b']);
});

test('parseMemory は frontmatter 欠落でも links を返し name/type は null', () => {
  const m = parseMemory('本文のみ [[x]]');
  assert.equal(m.name, null);
  assert.equal(m.type, null);
  assert.deepEqual(m.links, ['x']);
});

test('detectDanglingClusters は未作成メモリへの 2 参照以上のみ昇格候補にする', () => {
  const memories = [
    { name: 'a', fileBase: 'a', links: ['ghost', 'b'] },
    { name: 'b', fileBase: 'b', links: ['ghost'] },
    { name: 'c', fileBase: 'c', links: ['once-only'] },
  ];
  const clusters = detectDanglingClusters(memories);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].target, 'ghost');
  assert.deepEqual(clusters[0].referrers, ['a', 'b']);
  assert.equal(clusters[0].count, 2);
});

test('detectDanglingClusters は同一メモリからの重複リンクを 1 参照と数える', () => {
  const memories = [{ name: 'a', fileBase: 'a', links: ['ghost', 'ghost'] }];
  assert.equal(detectDanglingClusters(memories).length, 0);
});

test('findUncoveredBugFiles は閾値未満と feedback メモリ言及済みを除外する', () => {
  const topBugFiles = [
    { file: 'packages/x/src/foo.ts', count: 3 },
    { file: 'packages/y/src/bar.ts', count: 2 },
    { file: 'packages/z/src/baz.ts', count: 1 },
  ];
  const memories = [
    { name: 'm1', type: 'feedback', text: 'foo.ts の罠は…', links: [] },
    { name: 'm2', type: 'project', text: 'bar.ts は project メモリでの言及なので対象外', links: [] },
  ];
  const res = findUncoveredBugFiles(topBugFiles, memories);
  assert.deepEqual(
    res.map((f) => f.file),
    ['packages/y/src/bar.ts'],
  );
});

test('scanMemoryDir は MEMORY.md 索引を除外し、dir 不在は available:false を返す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-'));
  try {
    writeFileSync(join(dir, 'MEMORY.md'), '- index');
    writeFileSync(join(dir, 'one.md'), memoryMd('one', 'project', 'see [[two]]'));
    const res = scanMemoryDir(dir);
    assert.equal(res.available, true);
    assert.equal(res.memories.length, 1);
    assert.equal(res.memories[0].fileBase, 'one');
    assert.deepEqual(res.memories[0].links, ['two']);
    assert.equal(scanMemoryDir(join(dir, 'nope')).available, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanMemoryDir は 1 ファイルの読み取り失敗で全体を落とさず errors に記録して継続する', { skip: process.getuid?.() === 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-'));
  try {
    writeFileSync(join(dir, 'ok.md'), memoryMd('ok', 'project', 'body'));
    writeFileSync(join(dir, 'broken.md'), memoryMd('broken', 'project', 'body'));
    chmodSync(join(dir, 'broken.md'), 0o000);
    const res = scanMemoryDir(dir);
    assert.equal(res.available, true);
    assert.equal(res.memories.length, 1);
    assert.equal(res.memories[0].fileBase, 'ok');
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /broken\.md/);
  } finally {
    chmodSync(join(dir, 'broken.md'), 0o600);
    rmSync(dir, { recursive: true, force: true });
  }
});
