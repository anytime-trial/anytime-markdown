import {
  classifySession,
  resolveWorktree,
  buildAgentMapping,
  resolveSessionWorkspacePath,
  groupByWorkspace,
  ORPHAN_WORKTREE_PATH,
} from '../../src/mapping/agentMapping';
import type { WorktreeEntry } from '../../src/mapping/types';

describe('groupByWorkspace', () => {
  interface Item {
    readonly id: string;
    readonly workspacePath: string;
    readonly ageSeconds: number;
  }

  function group(items: readonly Item[]) {
    return groupByWorkspace(items, i => i.workspacePath, i => i.ageSeconds);
  }

  it('keeps same-named workspaces in different locations apart (keys on the full path, not the basename)', () => {
    const groups = group([
      { id: 'a', workspacePath: '/repo-a/.worktrees/feat', ageSeconds: 10 },
      { id: 'b', workspacePath: '/repo-b/.worktrees/feat', ageSeconds: 20 },
    ]);
    expect(groups.map(g => g.workspacePath)).toEqual([
      '/repo-a/.worktrees/feat',
      '/repo-b/.worktrees/feat',
    ]);
  });

  it('orders groups by their most recent session (smallest ageSeconds first)', () => {
    const groups = group([
      { id: 'old', workspacePath: '/slow', ageSeconds: 900 },
      { id: 'new', workspacePath: '/fast', ageSeconds: 5 },
      { id: 'mid', workspacePath: '/slow', ageSeconds: 30 },
    ]);
    // /slow の最小 age は 30 → /fast(5) が先。入力順ではなく群の最新アクティビティで決まる。
    expect(groups.map(g => g.workspacePath)).toEqual(['/fast', '/slow']);
  });

  it('preserves the input order of items within a group', () => {
    const groups = group([
      { id: 'first', workspacePath: '/repo', ageSeconds: 10 },
      { id: 'second', workspacePath: '/repo', ageSeconds: 20 },
    ]);
    expect(groups[0].items.map(i => i.id)).toEqual(['first', 'second']);
  });

  it('collects sessions with no workspace path into their own group', () => {
    const groups = group([
      { id: 'known', workspacePath: '/repo', ageSeconds: 50 },
      { id: 'unknown', workspacePath: '', ageSeconds: 10 },
    ]);
    expect(groups.map(g => g.workspacePath)).toEqual(['', '/repo']);
    expect(groups[0].items.map(i => i.id)).toEqual(['unknown']);
  });

  it('returns an empty array for no items', () => {
    expect(group([])).toEqual([]);
  });
});

describe('resolveSessionWorkspacePath', () => {
  it('prefers the resolved worktree path', () => {
    expect(resolveSessionWorkspacePath('/repo', '/repo')).toBe('/repo');
  });

  it('normalizes a sub-directory workspacePath (Codex cwd) up to the worktree root', () => {
    expect(resolveSessionWorkspacePath('/repo', '/repo/packages/foo')).toBe('/repo');
  });

  it('falls back to the session workspacePath for orphan sessions (other workspaces)', () => {
    expect(resolveSessionWorkspacePath(ORPHAN_WORKTREE_PATH, '/other/repo')).toBe('/other/repo');
  });

  it('returns an empty string when neither is available', () => {
    expect(resolveSessionWorkspacePath(ORPHAN_WORKTREE_PATH, undefined)).toBe('');
    expect(resolveSessionWorkspacePath('', '')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fixedNow(): Date {
  return new Date('2026-01-01T00:00:00.000Z');
}

function makeTimestamp(secondsAgo: number, now: Date = fixedNow()): string {
  return new Date(now.getTime() - secondsAgo * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// classifySession
// ---------------------------------------------------------------------------

describe('classifySession', () => {
  const now = fixedNow();

  test('5秒前 → active', () => {
    expect(classifySession(makeTimestamp(5, now), now)).toBe('active');
  });

  test('290秒前 → active', () => {
    expect(classifySession(makeTimestamp(290, now), now)).toBe('active');
  });

  test('301秒前 → recent', () => {
    expect(classifySession(makeTimestamp(301, now), now)).toBe('recent');
  });

  test('3600秒前 → recent', () => {
    expect(classifySession(makeTimestamp(3600, now), now)).toBe('recent');
  });

  test('3601秒前 → stale', () => {
    expect(classifySession(makeTimestamp(3601, now), now)).toBe('stale');
  });

  test('カスタムしきい値: 61秒前 / active:60 / recent:600 → recent', () => {
    const ts = makeTimestamp(61, now);
    expect(
      classifySession(ts, now, { activeThresholdSec: 60, recentThresholdSec: 600 })
    ).toBe('recent');
  });

  test('カスタムしきい値: 601秒前 / active:60 / recent:600 → stale', () => {
    const ts = makeTimestamp(601, now);
    expect(
      classifySession(ts, now, { activeThresholdSec: 60, recentThresholdSec: 600 })
    ).toBe('stale');
  });

  test('カスタムしきい値: 30秒前 / active:60 / recent:600 → active', () => {
    const ts = makeTimestamp(30, now);
    expect(
      classifySession(ts, now, { activeThresholdSec: 60, recentThresholdSec: 600 })
    ).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// resolveWorktree
// ---------------------------------------------------------------------------

describe('resolveWorktree', () => {
  const worktrees: WorktreeEntry[] = [
    { path: '/anytime-markdown', branch: 'main', isMain: true },
    { path: '/anytime-markdown/.worktrees/feature-a', branch: 'feature/a', isMain: false },
    { path: '/anytime-markdown/.worktrees/feature-b', branch: 'feature/b', isMain: false },
  ];

  test('file がworktree path に前方一致（最長一致）', () => {
    const result = resolveWorktree(
      '/anytime-markdown/.worktrees/feature-a/packages/foo/src/bar.ts',
      'feature/a',
      worktrees
    );
    expect(result?.path).toBe('/anytime-markdown/.worktrees/feature-a');
  });

  test('mainとfeature-aの両方にpathが前方一致する場合、最長一致を返す', () => {
    // '/anytime-markdown/.worktrees/feature-a/...' は both main and feature-a に前方一致するが
    // feature-a の方が長い
    const result = resolveWorktree(
      '/anytime-markdown/.worktrees/feature-a/src/index.ts',
      'feature/a',
      worktrees
    );
    expect(result?.path).toBe('/anytime-markdown/.worktrees/feature-a');
  });

  test('file が main worktree path に前方一致', () => {
    const result = resolveWorktree(
      '/anytime-markdown/packages/trail-core/src/index.ts',
      'main',
      worktrees
    );
    expect(result?.path).toBe('/anytime-markdown');
  });

  test('file が非空でどのworktreeにも一致せず sessionEdits も空 → orphan', () => {
    // 別リポジトリのファイルがブランチ名の偶然の一致で誤マッチしないことを確認
    const result = resolveWorktree(
      '/completely/different/path/src/foo.ts',
      'feature/b',
      worktrees
    );
    expect(result).toBeNull();
  });

  test('file がdocsリポジトリだが sessionEdits に worktree のファイルあり → sessionEdits で解決', () => {
    // コード編集後にdocs修正した場合、sessionEditsの履歴からworktreeを特定する
    const result = resolveWorktree(
      '/Shared/anytime-markdown-docs/spec/foo.md',
      'develop',
      worktrees,
      undefined,
      [
        { file: '/anytime-markdown/packages/trail-core/src/foo.ts', timestamp: '2026-05-04T00:00:00Z' },
        { file: '/Shared/anytime-markdown-docs/spec/foo.md', timestamp: '2026-05-04T01:00:00Z' },
      ]
    );
    expect(result?.path).toBe('/anytime-markdown');
  });

  test('sessionEdits の最新がdocs、その前がworktree → worktreeに解決（逆順スキャン）', () => {
    const result = resolveWorktree(
      '',
      'develop',
      worktrees,
      undefined,
      [
        { file: '/anytime-markdown/.worktrees/feature-b/src/foo.ts', timestamp: '2026-05-04T00:00:00Z' },
        { file: '/Shared/anytime-markdown-docs/spec/bar.md', timestamp: '2026-05-04T01:00:00Z' },
      ]
    );
    // 最新(docs)は不一致 → その前(worktree)で解決
    expect(result?.path).toBe('/anytime-markdown/.worktrees/feature-b');
  });

  test('sessionEdits がすべてdocsリポジトリ → orphan', () => {
    const result = resolveWorktree(
      '/Shared/anytime-markdown-docs/spec/foo.md',
      'develop',
      worktrees,
      undefined,
      [
        { file: '/Shared/anytime-markdown-docs/plan/bar.md', timestamp: '2026-05-04T00:00:00Z' },
        { file: '/Shared/anytime-markdown-docs/spec/foo.md', timestamp: '2026-05-04T01:00:00Z' },
      ]
    );
    expect(result).toBeNull();
  });

  test('file が空でbranchが一致 → branch でフォールバック（セッション開始直後）', () => {
    const result = resolveWorktree(
      '',
      'feature/b',
      worktrees
    );
    expect(result?.path).toBe('/anytime-markdown/.worktrees/feature-b');
  });

  test('workspacePath が worktree パスに一致 → step 0 で解決（テスト実行中など）', () => {
    const result = resolveWorktree(
      '',
      'develop',  // ブランチは main と同じで誤マッチしうる値
      worktrees,
      '/anytime-markdown/.worktrees/feature-b/packages/trail-core'
    );
    expect(result?.path).toBe('/anytime-markdown/.worktrees/feature-b');
  });

  test('workspacePath が別リポジトリ → step 0 で一致なし → orphan', () => {
    const result = resolveWorktree(
      '',
      'develop',
      worktrees,
      '/Shared/anytime-markdown-docs'
    );
    expect(result).toBeNull();
  });

  test('workspacePath が main worktree の cwd → main に解決', () => {
    const result = resolveWorktree(
      '',
      'develop',
      worktrees,
      '/anytime-markdown/packages/trail-core'
    );
    expect(result?.path).toBe('/anytime-markdown');
  });

  test('fileもbranchも一致しない → null', () => {
    const result = resolveWorktree(
      '/completely/different/path/src/foo.ts',
      'unknown-branch',
      worktrees
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildAgentMapping
// ---------------------------------------------------------------------------

describe('buildAgentMapping', () => {
  const now = fixedNow();

  const worktrees: WorktreeEntry[] = [
    { path: '/repo', branch: 'main', isMain: true },
    { path: '/repo/.worktrees/feat', branch: 'feature/x', isMain: false },
  ];

  test('2 worktree に 3 agent が分配される', () => {
    const agents = [
      {
        sessionId: 'a1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/packages/foo/src/index.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 'a2',
        source: 'claude' as const,
        editing: true,
        file: '/repo/.worktrees/feat/src/bar.ts',
        timestamp: makeTimestamp(200, now),
        branch: 'feature/x',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 'a3',
        source: 'claude' as const,
        editing: false,
        file: '/repo/packages/baz/index.ts',
        timestamp: makeTimestamp(400, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });

    expect(result).toHaveLength(2);
    const mainWt = result.find((w) => w.isMain);
    const featWt = result.find((w) => !w.isMain);
    expect(mainWt?.sessions).toHaveLength(2);
    expect(featWt?.sessions).toHaveLength(1);
  });

  test('pid / terminalPid は SessionMapping へ透過する（未指定は undefined）', () => {
    const agents = [
      {
        sessionId: 'p1',
        source: 'claude' as const,
        editing: false,
        file: '/somewhere/src/foo.ts',
        timestamp: makeTimestamp(100, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
        pid: 1234,
        terminalPid: 1200,
      },
      {
        sessionId: 'p2',
        source: 'claude' as const,
        editing: false,
        file: '/somewhere/src/bar.ts',
        timestamp: makeTimestamp(100, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, [], { now });

    const sessions = result.flatMap((w) => w.sessions);
    const p1 = sessions.find((s) => s.sessionId === 'p1');
    const p2 = sessions.find((s) => s.sessionId === 'p2');
    expect(p1?.pid).toBe(1234);
    expect(p1?.terminalPid).toBe(1200);
    expect(p2?.pid).toBeUndefined();
    expect(p2?.terminalPid).toBeUndefined();
  });

  test('orphan agent が出るケース（worktreesが空）', () => {
    const agents = [
      {
        sessionId: 'o1',
        source: 'claude' as const,
        editing: false,
        file: '/somewhere/else/src/foo.ts',
        timestamp: makeTimestamp(100, now),
        branch: 'some-branch',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, [], { now });

    expect(result).toHaveLength(1);
    expect(result[0].worktreePath).toBe('(orphan)');
    expect(result[0].sessions).toHaveLength(1);
    expect(result[0].sessions[0].sessionId).toBe('o1');
  });

  test('orphan agent が出るケース（file/branch ともに不一致）', () => {
    const agents = [
      {
        sessionId: 'o2',
        source: 'claude' as const,
        editing: false,
        file: '/completely/different/src/foo.ts',
        timestamp: makeTimestamp(100, now),
        branch: 'unknown-branch',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });

    // 全 worktree + orphan グループが含まれる
    expect(result.length).toBe(worktrees.length + 1);
    const orphan = result.find((w) => w.worktreePath === '(orphan)');
    expect(orphan).toBeDefined();
    expect(orphan?.sessions).toHaveLength(1);
  });

  test('全 agent が worktree に割り当てられた場合 orphan グループは含まれない', () => {
    const agents = [
      {
        sessionId: 'b1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/index.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });

    expect(result.every((w) => w.worktreePath !== '(orphan)')).toBe(true);
  });

  test('aggregatedState: active agent が 1 つあれば worktree は active', () => {
    const agents = [
      {
        sessionId: 's1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/a.ts',
        timestamp: makeTimestamp(10, now), // active
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 's2',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/b.ts',
        timestamp: makeTimestamp(4000, now), // stale
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const mainWt = result.find((w) => w.isMain);
    expect(mainWt?.aggregatedState).toBe('active');
  });

  test('aggregatedState: recent agent しかいなければ recent', () => {
    const agents = [
      {
        sessionId: 's3',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/a.ts',
        timestamp: makeTimestamp(400, now), // recent
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 's4',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/b.ts',
        timestamp: makeTimestamp(4000, now), // stale
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const mainWt = result.find((w) => w.isMain);
    expect(mainWt?.aggregatedState).toBe('recent');
  });

  test('activeCount が正しく計算される', () => {
    const agents = [
      {
        sessionId: 'c1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/a.ts',
        timestamp: makeTimestamp(10, now), // active
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 'c2',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/b.ts',
        timestamp: makeTimestamp(100, now), // active (< 300)
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
      {
        sessionId: 'c3',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/c.ts',
        timestamp: makeTimestamp(4000, now), // stale
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const mainWt = result.find((w) => w.isMain);
    expect(mainWt?.activeCount).toBe(2);
  });

  test('fileBasename が正しく設定される', () => {
    const agents = [
      {
        sessionId: 'd1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/packages/foo/src/MyFile.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const session = result.flatMap((w) => w.sessions).find((s) => s.sessionId === 'd1');
    expect(session?.fileBasename).toBe('MyFile.ts');
  });

  test('file が空文字のエージェントは fileBasename が空文字', () => {
    const agents = [
      {
        sessionId: 'e1',
        source: 'claude' as const,
        editing: false,
        file: '',
        timestamp: makeTimestamp(10, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const session = result.flatMap((w) => w.sessions).find((s) => s.sessionId === 'e1');
    expect(session?.fileBasename).toBe('');
  });

  test('worktreeName: main worktree は (main)', () => {
    const agents = [
      {
        sessionId: 'f1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/src/index.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'main',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const mainWt = result.find((w) => w.isMain);
    expect(mainWt?.worktreeName).toBe('(main)');
  });

  test('worktreeName: 非 main は path の basename', () => {
    const agents = [
      {
        sessionId: 'f2',
        source: 'claude' as const,
        editing: false,
        file: '/repo/.worktrees/feat/src/index.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'feature/x',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    const featWt = result.find((w) => !w.isMain);
    expect(featWt?.worktreeName).toBe('feat');
  });

  test('worktree に属するセッションが 0 でも worktree は結果に含まれる', () => {
    const agents = [
      {
        sessionId: 'g1',
        source: 'claude' as const,
        editing: false,
        file: '/repo/.worktrees/feat/src/index.ts',
        timestamp: makeTimestamp(10, now),
        branch: 'feature/x',
        sessionEdits: [],
        plannedEdits: [],
      },
    ];

    const result = buildAgentMapping(agents, worktrees, { now });
    // main worktree にセッションがなくても結果に含まれる
    const main = result.find((w) => w.isMain);
    expect(main).toBeDefined();
    expect(main?.sessions).toHaveLength(0);
    expect(main?.aggregatedState).toBe('stale');
    // feat worktree も含まれる
    expect(result).toHaveLength(worktrees.length);
  });
});
