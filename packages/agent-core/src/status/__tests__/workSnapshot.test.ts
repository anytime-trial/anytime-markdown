import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWorkSnapshot,
  listWorkSnapshots,
  pruneWorkSnapshots,
  resolveRepoRoot,
  restoreCommand,
  SNAPSHOT_REF_ROOT,
} from '../workSnapshot';

function git(repo: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

/** 一時ディレクトリに実 git リポジトリを作る。保護領域は一切触らない。 */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'anytime-worksnap-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'test']);
  writeFileSync(join(repo, 'tracked.txt'), 'base\n');
  git(repo, ['add', 'tracked.txt']);
  git(repo, ['commit', '-qm', 'init']);
  return repo;
}

describe('createWorkSnapshot', () => {
  let repo: string;
  afterEach(() => {
    if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true });
  });

  it('作業ツリーと本物の index を一切変更しない', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'tracked.txt'), 'base\nmodified\n');
    writeFileSync(join(repo, 'staged.txt'), 'staged\n');
    git(repo, ['add', 'staged.txt']);
    writeFileSync(join(repo, 'untracked.txt'), 'untracked\n');

    const before = git(repo, ['status', '--porcelain']);
    const beforeStaged = git(repo, ['diff', '--cached', '--name-only']);

    createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    expect(git(repo, ['status', '--porcelain'])).toBe(before);
    expect(git(repo, ['diff', '--cached', '--name-only'])).toBe(beforeStaged);
  });

  it('untracked ファイルとサブディレクトリを含むスナップショットを作る', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'tracked.txt'), 'base\nmodified\n');
    writeFileSync(join(repo, 'untracked.txt'), 'untracked\n');
    mkdirSync(join(repo, 'sub'));
    writeFileSync(join(repo, 'sub', 'deep.txt'), 'deep\n');

    const result = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    expect(result.snapshot).not.toBeNull();
    const files = git(repo, ['ls-tree', '-r', '--name-only', result.snapshot!.sha]).split('\n');
    expect(files).toContain('untracked.txt');
    expect(files).toContain('sub/deep.txt');
    expect(git(repo, ['show', `${result.snapshot!.sha}:tracked.txt`])).toBe('base\nmodified');
  });

  it('作業ツリーがクリーンならスナップショットを作らない', () => {
    repo = makeRepo();
    const result = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');
    expect(result.snapshot).toBeNull();
    expect(result.skipped).toBe('clean');
  });

  it('前回と同じ内容なら新しい ref を作らない', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'untracked.txt'), 'untracked\n');

    const first = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');
    expect(first.snapshot).not.toBeNull();

    const second = createWorkSnapshot(repo, '2026-07-13T05:15:00.000Z');
    expect(second.snapshot).toBeNull();
    expect(second.skipped).toBe('unchanged');

    const refs = git(repo, ['for-each-ref', '--format=%(refname)', 'refs/anytime/snapshots/']);
    expect(refs.split('\n').filter((l) => l !== '')).toHaveLength(1);
  });

  it('git clean -fd で消えた untracked をスナップショットから復元できる', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'untracked.txt'), 'precious\n');

    const result = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');
    git(repo, ['clean', '-fdq']);
    expect(existsSync(join(repo, 'untracked.txt'))).toBe(false);

    git(repo, ['restore', `--source=${result.snapshot!.sha}`, '--', 'untracked.txt']);
    expect(git(repo, ['show', `${result.snapshot!.sha}:untracked.txt`])).toBe('precious');
    expect(existsSync(join(repo, 'untracked.txt'))).toBe(true);
  });

  it('HEAD が無い（初コミット前の）リポジトリでも動く', () => {
    repo = mkdtempSync(join(tmpdir(), 'anytime-worksnap-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'test']);
    writeFileSync(join(repo, 'first.txt'), 'first\n');

    const result = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    expect(result.snapshot).not.toBeNull();
    expect(git(repo, ['ls-tree', '-r', '--name-only', result.snapshot!.sha])).toContain('first.txt');
  });
});

describe('listWorkSnapshots / pruneWorkSnapshots', () => {
  let repo: string;
  afterEach(() => {
    if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true });
  });

  it('新しい順に一覧を返す', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');
    writeFileSync(join(repo, 'b.txt'), 'b\n');
    createWorkSnapshot(repo, '2026-07-13T06:00:00.000Z');

    const list = listWorkSnapshots(repo);

    expect(list).toHaveLength(2);
    expect(list[0].createdAt).toBe('2026-07-13T06:00:00.000Z');
    expect(list[1].createdAt).toBe('2026-07-13T05:00:00.000Z');
    expect(list[0].fileCount).toBe(2);
  });

  it('cutoff より古いスナップショットの ref を削除する', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    createWorkSnapshot(repo, '2026-07-01T05:00:00.000Z');
    writeFileSync(join(repo, 'b.txt'), 'b\n');
    createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    const removed = pruneWorkSnapshots(repo, '2026-07-06T00:00:00.000Z');

    expect(removed).toBe(1);
    const list = listWorkSnapshots(repo);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe('2026-07-13T05:00:00.000Z');
  });

  it('他のワークツリーのスナップショットを prune しない', () => {
    repo = makeRepo();
    const foreignRef = `${SNAPSHOT_REF_ROOT}/other-repo-abcdef/20260701T050000Z`;
    git(repo, ['update-ref', foreignRef, git(repo, ['rev-parse', 'HEAD'])]);

    const removed = pruneWorkSnapshots(repo, '2026-07-06T00:00:00.000Z');

    expect(removed).toBe(0);
    expect(git(repo, ['for-each-ref', '--format=%(refname)', foreignRef])).toContain(foreignRef);
  });

  it('復元コマンドは作業ツリーを上書きする形で提示する（自動実行はしない）', () => {
    const cmd = restoreCommand({
      ref: 'refs/anytime/snapshots/x/20260713T050000Z',
      sha: 'abc1234',
      tree: 'def5678',
      createdAt: '2026-07-13T05:00:00.000Z',
      fileCount: 3,
    });
    expect(cmd).toBe('git restore --source=abc1234 --worktree -- .');
  });
});

describe('resolveRepoRoot', () => {
  let repo: string;
  afterEach(() => {
    if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true });
  });

  it('サブディレクトリからリポジトリルートを解決する', () => {
    repo = makeRepo();
    mkdirSync(join(repo, 'nested', 'deep'), { recursive: true });

    const resolved = resolveRepoRoot(join(repo, 'nested', 'deep'));

    // macOS の /var → /private/var 等のシンボリックリンク差を吸収するため realpath 比較
    expect(resolved).not.toBeNull();
    expect(realpathSync(resolved!)).toBe(realpathSync(repo));
  });

  it('git リポジトリでなければ null を返す', () => {
    const notRepo = mkdtempSync(join(tmpdir(), 'anytime-notrepo-'));
    try {
      expect(resolveRepoRoot(notRepo)).toBeNull();
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});
