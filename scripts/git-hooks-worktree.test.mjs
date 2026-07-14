import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `git worktree add` は、作業ツリーへファイルをチェックアウトする**前**に ref を動かす。
 * そのため reference-transaction フックが走る時点で新しい worktree は空であり、
 * `git rev-parse --show-toplevel`（＝新 worktree）を基点にスクリプトを探すと必ず外す。
 *
 * 症状: `Cannot find module '<新worktree>/scripts/git-activity-report.mjs'` が stderr に出て、
 * その worktree 作成イベントの記録が失われる。git 操作自体は `|| true` で成功する。
 */
function setupRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'git-hooks-wt-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');

  // 本物のフックを対象リポジトリへ持ち込む
  mkdirSync(join(dir, '.husky'), { recursive: true });
  writeFileSync(
    join(dir, '.husky', 'reference-transaction'),
    readFileSync(join(REPO_ROOT, '.husky', 'reference-transaction'), 'utf8'),
    { mode: 0o755 },
  );

  // フックが呼ぶスクリプトの代役。呼ばれたら記録するだけ。
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'git-activity-report.mjs'),
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.HOOK_LOG, process.argv.slice(2).join(' ') + '\\n');",
      '',
    ].join('\n'),
  );

  writeFileSync(join(dir, 'a.txt'), 'hi\n');
  git('add', 'a.txt', 'scripts/git-activity-report.mjs');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'init');
  git('config', 'core.hooksPath', '.husky');

  return { dir, git };
}

test('git worktree add でフックが新 worktree 基点にスクリプトを探して失敗しない', () => {
  const { dir, git } = setupRepo();
  const hookLog = join(dir, 'hook.log');
  const worktreePath = join(dir, 'wt');

  let stderr = '';
  try {
    execFileSync('git', ['worktree', 'add', '--detach', worktreePath, 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, HOOK_LOG: hookLog },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    stderr = String(error.stderr ?? '');
  }

  const combined = stderr;
  assert.ok(
    !combined.includes('Cannot find module'),
    `フックがスクリプトを見つけられていない:\n${combined}`,
  );

  // 記録が失われていないこと（フックが実際に起動したこと）
  assert.ok(existsSync(hookLog), 'フックがスクリプトを起動していない（記録が失われる）');
  assert.match(readFileSync(hookLog, 'utf8'), /reference-transaction/);

  rmSync(dir, { recursive: true, force: true });
});

test('通常のコミットでもフックがスクリプトを起動する（既存挙動の回帰防止）', () => {
  const { dir, git } = setupRepo();
  const hookLog = join(dir, 'hook.log');

  writeFileSync(join(dir, 'b.txt'), 'yo\n');
  git('add', 'b.txt');
  execFileSync('git', ['commit', '-qm', 'second'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOOK_LOG: hookLog },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.ok(existsSync(hookLog), 'コミット時にフックがスクリプトを起動していない');

  rmSync(dir, { recursive: true, force: true });
});
