import type { AirspaceClaim } from '@anytime-markdown/agent-core';

import { buildOwnershipRows, parseWorktreeList } from '../worktreeOwnershipModel';

function claim(overrides: Partial<AirspaceClaim>): AirspaceClaim {
  return {
    sessionId: 'session-1',
    pid: 123,
    starttime: '100',
    worktree: '/repo',
    branch: 'main',
    file: '/repo/README.md',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('parseWorktreeList', () => {
  it('parses a normal worktree', () => {
    expect(
      parseWorktreeList(
        [
          'worktree /repo',
          'HEAD 0123456789abcdef0123456789abcdef01234567',
          'branch refs/heads/main',
          '',
        ].join('\n'),
      ),
    ).toEqual([
      {
        path: '/repo',
        head: '0123456789abcdef0123456789abcdef01234567',
        branch: 'main',
        detached: false,
        bare: false,
      },
    ]);
  });

  it('parses detached HEAD and bare repositories', () => {
    expect(
      parseWorktreeList(
        [
          'worktree /repo-detached',
          'HEAD abcdefabcdefabcdefabcdefabcdefabcdefabcd',
          'detached',
          '',
          'worktree /repo-bare',
          'HEAD 1111111111111111111111111111111111111111',
          'bare',
        ].join('\n'),
      ),
    ).toEqual([
      {
        path: '/repo-detached',
        head: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        branch: null,
        detached: true,
        bare: false,
      },
      {
        path: '/repo-bare',
        head: '1111111111111111111111111111111111111111',
        branch: null,
        detached: false,
        bare: true,
      },
    ]);
  });

  it('parses multiple worktrees without requiring a trailing blank line', () => {
    expect(
      parseWorktreeList(
        [
          'worktree /repo',
          'HEAD 0000000000000000000000000000000000000000',
          'branch refs/heads/main',
          '',
          'worktree /repo-feature',
          'HEAD 2222222222222222222222222222222222222222',
          'branch refs/heads/feature/task',
        ].join('\n'),
      ).map((worktree) => [worktree.path, worktree.branch]),
    ).toEqual([
      ['/repo', 'main'],
      ['/repo-feature', 'feature/task'],
    ]);
  });
});

describe('buildOwnershipRows', () => {
  const worktrees = [
    { path: '/repo', head: null, branch: 'main', detached: false, bare: false },
    { path: '/repo-feature', head: null, branch: 'feature/task', detached: false, bare: false },
  ];

  it('marks claimed worktrees occupied and unclaimed worktrees free', () => {
    const rows = buildOwnershipRows(worktrees, [claim({ worktree: '/repo' })]);

    expect(rows).toEqual([
      {
        worktreePath: '/repo',
        branch: 'main',
        sessionId: 'session-1',
        pid: 123,
        editingFile: '/repo/README.md',
        state: 'occupied',
        orphan: false,
      },
      {
        worktreePath: '/repo-feature',
        branch: 'feature/task',
        sessionId: null,
        pid: null,
        editingFile: null,
        state: 'free',
        orphan: false,
      },
    ]);
  });

  it('does not attach a claim to a different worktree', () => {
    const rows = buildOwnershipRows(worktrees, [claim({ worktree: '/somewhere-else' })]);

    expect(rows.filter((row) => row.state === 'free')).toHaveLength(2);
    expect(rows.find((row) => row.orphan)?.worktreePath).toBe('/somewhere-else');
  });

  it('keeps orphan claims when their worktree no longer exists', () => {
    const rows = buildOwnershipRows(worktrees, [
      claim({
        sessionId: 'orphan-session',
        pid: 456,
        worktree: '/deleted-worktree',
        branch: 'deleted',
        file: '',
      }),
    ]);

    expect(rows.at(-1)).toEqual({
      worktreePath: '/deleted-worktree',
      branch: 'deleted',
      sessionId: 'orphan-session',
      pid: 456,
      editingFile: null,
      state: 'occupied',
      orphan: true,
    });
  });
});

