import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// format-docs.mjs は markdown-engine / section-lock-core の TypeScript を直接 import するため
// 素の node では読めない。CLI を tsx 子プロセスで起動して外形（書込の有無・exit code）を検証する。

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO_ROOT, 'scripts', 'format-docs.mjs');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

function runCli(args) {
  const r = spawnSync(TSX, [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// 見出し直後の空行が無い（headingBlankLines で整形対象になる）本文。
const UNFORMATTED = ['# タイトル', '', '## 設計', '設計本文。', '', '## 運用', '', '運用本文。', ''].join('\n');
const FORMATTED = ['# タイトル', '', '## 設計', '', '設計本文。', '', '## 運用', '', '運用本文。', ''].join('\n');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'format-docs-'));
}

/** section-lock-core で「タイトル > 設計」をロックした文書を作る（tsx 子プロセスで生成）。 */
function makeLockedDoc(dir, body) {
  const helper = path.join(dir, 'lock-helper.mts');
  const core = path.join(REPO_ROOT, 'packages', 'section-lock-core', 'src', 'index.ts');
  fs.writeFileSync(
    helper,
    [
      `import { computeSectionHash, listSections, upsertLockedSection } from ${JSON.stringify(core)};`,
      'import fs from "node:fs";',
      'const doc = fs.readFileSync(process.argv[2], "utf8");',
      'const section = listSections(doc).find((s) => s.path === "タイトル > 設計");',
      'if (!section) throw new Error("section not found");',
      'const entry = { path: section.path, occurrence: section.occurrence, hash: computeSectionHash(doc, section), lockedAt: "2026-09-28T00:00:00.000Z", lockedBy: "test" };',
      'process.stdout.write(upsertLockedSection(doc, entry));',
    ].join('\n'),
  );
  const src = path.join(dir, 'src.md');
  fs.writeFileSync(src, body);
  return execFileSync(TSX, [helper, src], { cwd: REPO_ROOT, encoding: 'utf8' });
}

test('fix: 変更があるファイルだけ上書きし、整形不要のファイルは触らない', () => {
  const dir = makeTempDir();
  const dirty = path.join(dir, 'dirty.md');
  const clean = path.join(dir, 'clean.md');
  fs.writeFileSync(dirty, UNFORMATTED);
  fs.writeFileSync(clean, FORMATTED);
  const cleanMtime = fs.statSync(clean).mtimeMs;

  const r = runCli([dir]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(fs.readFileSync(dirty, 'utf8'), FORMATTED);
  assert.equal(fs.statSync(clean).mtimeMs, cleanMtime, '整形不要のファイルが書き換えられた');
  assert.match(r.stdout, /formatted .*dirty\.md \(headingBlankLines=1\)/);
  assert.match(r.stdout, /ok .*clean\.md/);
});

test('--check: 書き込まず、変更ありなら exit 1', () => {
  const dir = makeTempDir();
  const dirty = path.join(dir, 'dirty.md');
  fs.writeFileSync(dirty, UNFORMATTED);

  const r = runCli(['--check', dirty]);
  assert.equal(r.code, 1);
  assert.equal(fs.readFileSync(dirty, 'utf8'), UNFORMATTED, '--check で書き換えられた');
  assert.match(r.stdout, /needs-format .*dirty\.md/);
});

test('--check: 変更なしなら exit 0', () => {
  const dir = makeTempDir();
  const clean = path.join(dir, 'clean.md');
  fs.writeFileSync(clean, FORMATTED);
  assert.equal(runCli(['--check', clean]).code, 0);
});

test('ロック節に触れる整形は書き込まず exit 1（MCP の assertNoLockViolation と同じ判定）', () => {
  const dir = makeTempDir();
  const locked = makeLockedDoc(dir, UNFORMATTED);
  assert.match(locked, /lockedSections:/, 'フィクスチャにロックが付いていない');
  const file = path.join(dir, 'locked.md');
  fs.writeFileSync(file, locked);

  const r = runCli([file]);
  assert.equal(r.code, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), locked, 'ロック節を含むファイルが上書きされた');
  assert.match(r.stdout, /lock-violation .*locked\.md/);
  assert.match(r.stderr, /section_modified: タイトル > 設計\(1\)/);
});

test('ロック節の外だけを整形する変更は書き込まれる', () => {
  const dir = makeTempDir();
  // 「設計」節は整形済み、「運用」節だけ見出し直後の空行が無い。
  const body = ['# タイトル', '', '## 設計', '', '設計本文。', '', '## 運用', '運用本文。', ''].join('\n');
  const locked = makeLockedDoc(dir, body);
  const file = path.join(dir, 'partially-locked.md');
  fs.writeFileSync(file, locked);

  const r = runCli([file]);
  assert.equal(r.code, 0, r.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.notEqual(after, locked);
  assert.match(after, /## 運用\n\n運用本文。/);
  assert.match(after, /lockedSections:/, 'frontmatter のロックが失われた');
});

test('引数なしは usage を出して exit 2、存在しないパスも exit 2', () => {
  assert.equal(runCli([]).code, 2);
  assert.equal(runCli([path.join(os.tmpdir(), 'format-docs-no-such-dir')]).code, 2);
});
