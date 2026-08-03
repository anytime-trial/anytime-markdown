import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { summarizeGitDiff } from '../../doctrine/gitDiffSummary';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function commitFile(repo: string, file: string, body: string, message: string): void {
  const target = path.join(repo, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, body, 'utf8');
  git(repo, 'add', file);
  git(repo, 'commit', '-m', message);
}

describe('summarizeGitDiff', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'acceptance-review-git-'));
    git(repo, 'init', '-b', 'develop');
    commitFile(repo, 'base.txt', 'base\n', 'base commit');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('作業ブランチのコミットと変更ファイルの増減を返す', async () => {
    git(repo, 'checkout', '-b', 'feature/x');
    commitFile(repo, 'src/added.ts', 'export const a = 1;\n', 'feat: add a');

    const summary = await summarizeGitDiff({ cwd: repo, baseRef: 'develop', headRef: 'HEAD' });

    expect(summary.available).toBe(true);
    expect(summary.degradedReason).toBeNull();
    expect(summary.commits.map((c) => c.subject)).toEqual(['feat: add a']);
    expect(summary.commits[0]?.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(summary.files).toEqual([{ path: 'src/added.ts', insertions: 1, deletions: 0 }]);
  });

  it('基準ブランチが先行していても基準側の変更を含めない（3 点表記）', async () => {
    git(repo, 'checkout', '-b', 'feature/x');
    commitFile(repo, 'src/mine.ts', 'export const mine = 1;\n', 'feat: mine');
    git(repo, 'checkout', 'develop');
    commitFile(repo, 'src/theirs.ts', 'export const theirs = 1;\n', 'feat: theirs');
    git(repo, 'checkout', 'feature/x');

    const summary = await summarizeGitDiff({ cwd: repo, baseRef: 'develop', headRef: 'HEAD' });

    expect(summary.files.map((f) => f.path)).toEqual(['src/mine.ts']);
    expect(summary.commits.map((c) => c.subject)).toEqual(['feat: mine']);
  });

  it('存在しない base_ref では例外を投げず縮退理由を返す', async () => {
    const summary = await summarizeGitDiff({ cwd: repo, baseRef: 'no-such-ref', headRef: 'HEAD' });

    expect(summary.available).toBe(false);
    expect(summary.degradedReason).not.toBeNull();
    expect(summary.degradedReason).toContain('no-such-ref');
    expect(summary.commits).toEqual([]);
    expect(summary.files).toEqual([]);
  });

  it('git リポジトリでないディレクトリでも例外を投げない', async () => {
    const plain = mkdtempSync(path.join(tmpdir(), 'acceptance-review-plain-'));
    try {
      const summary = await summarizeGitDiff({ cwd: plain, baseRef: 'develop', headRef: 'HEAD' });
      expect(summary.available).toBe(false);
      expect(summary.degradedReason).not.toBeNull();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('バイナリ変更の増減は null で返す', async () => {
    git(repo, 'checkout', '-b', 'feature/bin');
    const target = path.join(repo, 'assets/blob.bin');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from([0, 1, 2, 0, 255]));
    git(repo, 'add', 'assets/blob.bin');
    git(repo, 'commit', '-m', 'chore: add binary');

    const summary = await summarizeGitDiff({ cwd: repo, baseRef: 'develop', headRef: 'HEAD' });

    expect(summary.files).toEqual([{ path: 'assets/blob.bin', insertions: null, deletions: null }]);
  });
});
