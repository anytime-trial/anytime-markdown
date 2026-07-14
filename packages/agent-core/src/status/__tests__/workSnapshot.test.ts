import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  realpathSync,
  statSync,
} from 'node:fs';
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
    // `.`（cwd 相対）ではなく `:/`（リポジトリルート相対）。サブディレクトリで貼られたときに
    // 部分復元にならないようにする。
    expect(cmd).toBe('git restore --source=abc1234 --worktree -- :/');
  });
});

describe('レビュー指摘の回帰テスト', () => {
  let repo: string;
  afterEach(() => {
    if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true });
  });

  // 一時 index が固定パスだった頃、2 プロセスが同じリポジトリでスナップショットを取ると
  // 相手の一時 index を消し合い、write-tree が例外を投げずに空 tree（4b825dc6...）を返した。
  // 結果「N files」と表示されるのに中身が空のスナップショットが黙って残った。
  it('同一リポジトリで連続実行しても、空 tree のスナップショットを作らない', () => {
    repo = makeRepo();
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

    writeFileSync(join(repo, 'a.txt'), 'a\n');
    const first = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');
    writeFileSync(join(repo, 'b.txt'), 'b\n');
    const second = createWorkSnapshot(repo, '2026-07-13T05:05:00.000Z');

    expect(first.snapshot!.tree).not.toBe(EMPTY_TREE);
    expect(second.snapshot!.tree).not.toBe(EMPTY_TREE);
    // 中身が実在すること（空 tree なら ls-tree は空になる）
    expect(git(repo, ['ls-tree', '-r', '--name-only', second.snapshot!.sha])).toContain('b.txt');
  });

  // git status は既定（-unormal）で untracked ディレクトリを `?? sub/` の 1 行に折り畳むが、
  // git add -A は配下の全ファイルを取り込む。揃えないと fileCount が実件数より小さく出る。
  it('untracked ディレクトリ配下のファイルを fileCount に数える', () => {
    repo = makeRepo();
    mkdirSync(join(repo, 'sub'), { recursive: true });
    writeFileSync(join(repo, 'sub', 'a.txt'), 'a\n');
    writeFileSync(join(repo, 'sub', 'b.txt'), 'b\n');
    writeFileSync(join(repo, 'top.txt'), 'top\n');

    const result = createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    // sub/a.txt + sub/b.txt + top.txt = 3。折り畳まれると 2 になる。
    expect(result.snapshot!.fileCount).toBe(3);
    expect(listWorkSnapshots(repo)[0].fileCount).toBe(3);
  });

  // ref 名の timestamp をパースできない ref を createdAt にそのまま入れると、prune の文字列比較で
  // 常に「新しい」と判定され永久に消えなくなる。一覧から除外して prune の対象外にする。
  it('形式外の ref 名を一覧に混ぜない（prune の文字列比較を壊さないため）', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    const slug = listWorkSnapshots(repo)[0].ref.split('/').at(-2);
    const bogusRef = `${SNAPSHOT_REF_ROOT}/${slug}/not-a-timestamp`;
    git(repo, ['update-ref', bogusRef, git(repo, ['rev-parse', 'HEAD'])]);

    const list = listWorkSnapshots(repo);

    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe('2026-07-13T05:00:00.000Z');
  });

  // git status は stat キャッシュ更新のため本物の index を書き換える（index.lock を奪う）。
  // --no-optional-locks で抑止する。これは「本物の index に一切書き込まない」不変条件の一部。
  it('本物の .git/index を書き換えない（--no-optional-locks）', () => {
    repo = makeRepo();
    writeFileSync(join(repo, 'tracked.txt'), 'base\nmodified\n');

    const indexPath = join(repo, '.git', 'index');
    const before = statSync(indexPath).mtimeMs;

    createWorkSnapshot(repo, '2026-07-13T05:00:00.000Z');

    expect(statSync(indexPath).mtimeMs).toBe(before);
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
