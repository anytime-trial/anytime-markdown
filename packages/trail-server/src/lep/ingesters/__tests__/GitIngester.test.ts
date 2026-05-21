import type { AnalyzerContext, AnalyzerEvent, EventBusPublisher } from '@anytime-markdown/memory-core';

import { GitIngester, type GitReader, type GitLogEntry } from '../GitIngester';

function makeBus(): { bus: EventBusPublisher; events: AnalyzerEvent[] } {
  const events: AnalyzerEvent[] = [];
  return { events, bus: { publish: async (e) => { events.push(e); } } };
}

function makeCtx(bus: EventBusPublisher): AnalyzerContext {
  return {
    runId: 'r1',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus,
  };
}

function fakeReader(spec: Record<string, { commits: GitLogEntry[]; tags: readonly string[]; tagCommits: Record<string, string> }>): GitReader {
  return {
    listCommits: (gitRoot: string) => spec[gitRoot]?.commits ?? [],
    listTags: (gitRoot: string) => spec[gitRoot]?.tags ?? [],
    getTagCommit: (gitRoot: string, tag: string) => spec[gitRoot]?.tagCommits[tag] ?? '',
  };
}

describe('GitIngester', () => {
  it('emits git_commit + git_tag for each commit / tag in each gitRoot', async () => {
    const reader = fakeReader({
      '/repo/a': {
        commits: [
          { hash: 'a1', committedAt: '2026-05-19T00:00:00.000Z', author: 'alice', message: 'feat: x' },
          { hash: 'a2', committedAt: '2026-05-18T00:00:00.000Z', author: 'bob',   message: 'fix: y' },
        ],
        tags: ['v1.0.0', 'v0.9.0'],
        tagCommits: { 'v1.0.0': 'a1', 'v0.9.0': 'a2' },
      },
    });

    const ingester = new GitIngester({ gitRoots: ['/repo/a'], gitReader: reader });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    const commits = events.filter((e) => e.kind === 'git_commit');
    const tags = events.filter((e) => e.kind === 'git_tag');
    expect(commits).toHaveLength(2);
    expect(tags).toHaveLength(2);
    if (commits[0].kind === 'git_commit') {
      expect(commits[0].repo).toBe('a');
      expect(commits[0].hash).toBe('a1');
      expect(commits[0].author).toBe('alice');
      expect(commits[0].committedAt).toBe('2026-05-19T00:00:00.000Z');
      expect(commits[0].message).toBe('feat: x');
    }
    if (tags[0].kind === 'git_tag') {
      expect(tags[0].repo).toBe('a');
      expect(tags[0].tag).toBe('v1.0.0');
      expect(tags[0].commitHash).toBe('a1');
    }
  });

  it('emits events per gitRoot independently', async () => {
    const reader = fakeReader({
      '/repo/a': {
        commits: [{ hash: 'h1', committedAt: '2026-05-19T00:00:00.000Z', author: 'u', message: 'm' }],
        tags: [],
        tagCommits: {},
      },
      '/repo/b': {
        commits: [],
        tags: ['v2.0.0'],
        tagCommits: { 'v2.0.0': 'b1' },
      },
    });
    const ingester = new GitIngester({ gitRoots: ['/repo/a', '/repo/b'], gitReader: reader });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    const commits = events.filter((e) => e.kind === 'git_commit');
    const tags = events.filter((e) => e.kind === 'git_tag');
    expect(commits).toHaveLength(1);
    expect(tags).toHaveLength(1);
    if (commits[0].kind === 'git_commit') expect(commits[0].repo).toBe('a');
    if (tags[0].kind === 'git_tag') expect(tags[0].repo).toBe('b');
  });

  it('continues to next gitRoot when listCommits throws', async () => {
    const reader: GitReader = {
      listCommits: (gitRoot) => {
        if (gitRoot === '/repo/bad') throw new Error('boom');
        return [{ hash: 'g1', committedAt: '2026-05-19T00:00:00.000Z', author: 'u', message: 'm' }];
      },
      listTags: () => [],
      getTagCommit: () => '',
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/bad', '/repo/good'], gitReader: reader });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    const commits = events.filter((e) => e.kind === 'git_commit');
    expect(commits).toHaveLength(1);
    if (commits[0].kind === 'git_commit') expect(commits[0].hash).toBe('g1');
  });

  it('falls back to empty commitHash if getTagCommit throws', async () => {
    const reader: GitReader = {
      listCommits: () => [],
      listTags: () => ['v1.0.0'],
      getTagCommit: () => { throw new Error('rev-list failed'); },
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/a'], gitReader: reader });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    const tags = events.filter((e) => e.kind === 'git_tag');
    expect(tags).toHaveLength(1);
    if (tags[0].kind === 'git_tag') {
      expect(tags[0].tag).toBe('v1.0.0');
      expect(tags[0].commitHash).toBe('');
    }
  });

  it('handles empty gitRoots without emitting', async () => {
    const ingester = new GitIngester({ gitRoots: [], gitReader: { listCommits: () => [], listTags: () => [], getTagCommit: () => '' } });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('exposes tier=1 and proper emits', () => {
    const ingester = new GitIngester({ gitRoots: [] });
    expect(ingester.tier).toBe(1);
    expect(ingester.id).toBe('GitIngester');
    expect(ingester.subscribes).toEqual([]);
    expect(ingester.emits).toEqual(['git_commit', 'git_tag']);
  });

  it('continues to next gitRoot when listTags throws', async () => {
    const logs: string[] = [];
    const reader: GitReader = {
      listCommits: () => [],
      listTags: (gitRoot) => {
        if (gitRoot === '/repo/bad') throw new Error('tag-list-boom');
        return ['v1.0.0'];
      },
      getTagCommit: () => 'abc123',
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/bad', '/repo/good'], gitReader: reader });
    const { bus, events } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (m) => logs.push(m) },
      bus,
    };
    await ingester.onRunEnd(ctx);

    const tags = events.filter((e) => e.kind === 'git_tag');
    expect(tags).toHaveLength(1); // only from /repo/good
    expect(logs.some((l) => l.includes('listTags failed') && l.includes('tag-list-boom'))).toBe(true);
  });

  it('respects maxCommitsPerRoot option', async () => {
    const reader: GitReader = {
      listCommits: (_, limit) => {
        const count = limit ?? 5000;
        return Array.from({ length: count }, (__, i) => ({
          hash: `h${i}`,
          committedAt: '2026-05-19T00:00:00.000Z',
          author: 'u',
          message: 'm',
        }));
      },
      listTags: () => [],
      getTagCommit: () => '',
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/a'], maxCommitsPerRoot: 3, gitReader: reader });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    const commits = events.filter((e) => e.kind === 'git_commit');
    expect(commits).toHaveLength(3);
  });

  it('defaultGitReader.listCommits parses commits correctly with real git repo', async () => {
    // Covers the main parse path in defaultGitReader.listCommits (lines 165-178)
    // including the parts.length < 4 skip and the normal parse path
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { defaultGitReader } = await import('../GitIngester');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ingester-parse-'));
    try {
      execFileSync('git', ['init'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'b.txt'), 'world');
      execFileSync('git', ['add', 'b.txt'], { cwd: dir });
      execFileSync('git', ['commit', '-m', 'feat: hello world'], { cwd: dir });

      const commits = defaultGitReader.listCommits(dir, 5);
      // Should parse exactly 1 commit with correct fields
      expect(commits).toHaveLength(1);
      expect(commits[0].message).toBe('feat: hello world');
      expect(commits[0].author).toBe('Test User');
      expect(commits[0].hash).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses defaultGitReader with a real git repo', async () => {
    // defaultGitReader の実コード行(149-188)をカバーするため
    // 実際の git リポジトリを一時ディレクトリに作成する
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { defaultGitReader } = await import('../GitIngester');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ingester-real-'));
    try {
      execFileSync('git', ['init'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
      execFileSync('git', ['add', 'a.txt'], { cwd: dir });
      execFileSync('git', ['commit', '-m', 'init commit'], { cwd: dir });
      execFileSync('git', ['tag', 'v1.0.0'], { cwd: dir });

      const commits = defaultGitReader.listCommits(dir, 100);
      expect(commits).toHaveLength(1);
      expect(commits[0].message).toBe('init commit');
      expect(commits[0].author).toBe('Test');

      const tags = defaultGitReader.listTags(dir);
      expect(tags).toContain('v1.0.0');

      const commitHash = defaultGitReader.getTagCommit(dir, 'v1.0.0');
      expect(commitHash).toBe(commits[0].hash);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logs non-Error throws as String(err) when listCommits throws non-Error', async () => {
    // Covers the `String(err)` branch in listCommits error handler (line 83)
    const logs: string[] = [];
    const reader: GitReader = {
      listCommits: () => { throw 'string-error'; }, // non-Error throw
      listTags: () => [],
      getTagCommit: () => '',
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/a'], gitReader: reader });
    const { bus } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (m) => logs.push(m) },
      bus,
    };
    await ingester.onRunEnd(ctx);
    expect(logs.some((l) => l.includes('listCommits failed') && l.includes('string-error'))).toBe(true);
  });

  it('logs non-Error throws as String(err) when listTags or getTagCommit throw non-Error', async () => {
    // Covers String(err) branches in listTags/getTagCommit error handlers (lines 106, 118)
    const logs: string[] = [];
    const reader: GitReader = {
      listCommits: () => [],
      listTags: () => { throw 42; }, // non-Error throw
      getTagCommit: () => '',
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/a'], gitReader: reader });
    const { bus } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (m) => logs.push(m) },
      bus,
    };
    await ingester.onRunEnd(ctx);
    expect(logs.some((l) => l.includes('listTags failed') && l.includes('42'))).toBe(true);
  });

  it('logs non-Error throws when getTagCommit throws non-Error', async () => {
    const logs: string[] = [];
    const reader: GitReader = {
      listCommits: () => [],
      listTags: () => ['v1.0.0'],
      getTagCommit: () => { throw { code: 'ENOENT' }; }, // non-Error object
    };
    const ingester = new GitIngester({ gitRoots: ['/repo/a'], gitReader: reader });
    const { bus } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (m) => logs.push(m) },
      bus,
    };
    await ingester.onRunEnd(ctx);
    expect(logs.some((l) => l.includes('getTagCommit failed'))).toBe(true);
  });

  it('defaultGitReader.listCommits returns [] for non-git directory', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { defaultGitReader } = await import('../GitIngester');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ingester-empty-'));
    try {
      const commits = defaultGitReader.listCommits(dir, 100);
      expect(commits).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
