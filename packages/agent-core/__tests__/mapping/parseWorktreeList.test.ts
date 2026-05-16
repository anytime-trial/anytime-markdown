import { parseWorktreeList } from '../../src/mapping/parseWorktreeList';

describe('parseWorktreeList', () => {
  it('parses a single main worktree', () => {
    const output = [
      'worktree /repo',
      'HEAD abcdef',
      'branch refs/heads/main',
      '',
    ].join('\n');
    expect(parseWorktreeList(output)).toEqual([
      { path: '/repo', branch: 'main', isMain: true },
    ]);
  });

  it('marks subsequent worktrees as non-main', () => {
    const output = [
      'worktree /repo',
      'branch refs/heads/develop',
      '',
      'worktree /repo/.worktrees/feat',
      'branch refs/heads/feature/x',
      '',
    ].join('\n');
    const entries = parseWorktreeList(output);
    expect(entries).toHaveLength(2);
    expect(entries[0].isMain).toBe(true);
    expect(entries[1]).toEqual({
      path: '/repo/.worktrees/feat',
      branch: 'feature/x',
      isMain: false,
    });
  });

  it('falls back to "(detached)" when no branch line is present', () => {
    const output = ['worktree /repo', 'HEAD abc', 'detached', ''].join('\n');
    expect(parseWorktreeList(output)[0].branch).toBe('(detached)');
  });

  it('returns an empty array for empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});
