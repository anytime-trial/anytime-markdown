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
});
