import test from 'node:test';
import assert from 'node:assert/strict';
import { findViolations } from './check-bare-git-exec.mjs';

// 初回移行で実際に取りこぼした形（promisify 版の非同期呼び出し）を含める。
const VIOLATIONS = [
  "const x = execFileSync('git', ['status', '--porcelain']);",
  'const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });',
  "const { stdout } = await execFileP('git', args, opts);",
  "const st = spawnSync('git', ['diff'], { cwd });",
  "execFile('git', ['clone', url, dest], (error) => {});",
  "spawn( 'git' , args );",
];

const ALLOWED = [
  "execFileSync(resolveGitExecutable(), ['status']);",
  'await execFileAsync(gitExecutable, args, { cwd });',
  "const GIT_BASENAME = 'git';",
  "logger.warn(`Failed to run git ${args.join(' ')}`);",
];

test('bare git の exec を検出する', () => {
  for (const line of VIOLATIONS) {
    assert.equal(findViolations(line).length, 1, `検出できていない: ${line}`);
  }
});

test('解決済みの呼び出しと単なる文字列は検出しない', () => {
  for (const line of ALLOWED) {
    assert.equal(findViolations(line).length, 0, `誤検出: ${line}`);
  }
});

test('行番号は 1 始まりで返る', () => {
  const text = ['const a = 1;', '', "execFileSync('git', []);"].join('\n');
  assert.deepEqual(
    findViolations(text).map((v) => v.line),
    [3],
  );
});
