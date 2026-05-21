import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CommitResolver } from '../CommitResolver';

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

interface FakeDbState {
  resolveCommitsCalls: Array<{ sessionId: string; gitRoot: string; repoName: string }>;
  resolutionsDone: Set<string>;
  resolveCommitsImpl: (sid: string, root: string, repo: string) => number;
}

function makeFakeTrailDb(state: FakeDbState): TrailDatabase {
  return {
    isCommitResolutionDone: (sid: string, repoName: string) =>
      state.resolutionsDone.has(`${sid}:${repoName}`),
    resolveCommits: (sid: string, root: string, repoName: string) => {
      state.resolveCommitsCalls.push({ sessionId: sid, gitRoot: root, repoName });
      return state.resolveCommitsImpl(sid, root, repoName);
    },
  } as unknown as TrailDatabase;
}

describe('CommitResolver', () => {
  it('resolves commits for session_imported event across all watched repos', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => 3,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a', '/repo/b'] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 's1',
      messageCount: 10,
      repoName: 'r',
    }, ctx);
    await resolver.onRunEnd(ctx);

    expect(state.resolveCommitsCalls).toHaveLength(2);
    expect(state.resolveCommitsCalls[0].gitRoot).toBe('/repo/a');
    expect(state.resolveCommitsCalls[1].gitRoot).toBe('/repo/b');
    expect(resolver.getCommitsResolved()).toBe(6); // 3 * 2 repos
    const cr = events.filter((e) => e.kind === 'commit_resolved');
    expect(cr).toHaveLength(1);
    if (cr[0].kind === 'commit_resolved') expect(cr[0].sessionId).toBe('s1');
  });

  it('also resolves on session_skipped event (skipped session may still need commit resolve)', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => 1,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a'] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_skipped',
      sessionId: 's2',
      reason: 'file_unchanged',
    }, ctx);
    await resolver.onRunEnd(ctx);

    expect(state.resolveCommitsCalls).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'commit_resolved')).toHaveLength(1);
  });

  it('skips already-resolved (sid, repo) pairs', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(['s3:a']),
      resolveCommitsImpl: () => 1,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a', '/repo/b'] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 's3',
      messageCount: 1,
      repoName: 'a',
    }, ctx);

    expect(state.resolveCommitsCalls).toHaveLength(1);
    expect(state.resolveCommitsCalls[0].repoName).toBe('b');
  });

  it('handles resolveCommits throwing without aborting other repos', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: (_sid, _root, repo) => {
        if (repo === 'bad') throw new Error('git not found');
        return 2;
      },
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/bad', '/repo/good'] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 's4',
      messageCount: 1,
      repoName: 'r',
    }, ctx);

    expect(state.resolveCommitsCalls).toHaveLength(2);
    expect(resolver.getCommitsResolved()).toBe(2); // only good succeeded
  });

  it('does not emit commit_resolved when gitRoots is empty', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => 1,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: [] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 's5',
      messageCount: 1,
      repoName: 'r',
    }, ctx);

    expect(events).toEqual([]);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const resolver = new CommitResolver({
      trailDb: {} as unknown as TrailDatabase,
      gitRoots: [],
    });
    expect(resolver.tier).toBe(2);
    expect(resolver.id).toBe('CommitResolver');
    expect(resolver.subscribes).toEqual(['session_imported', 'session_skipped']);
    expect(resolver.emits).toEqual(['commit_resolved']);
  });

  it('ignores events that are not session_imported or session_skipped', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => 1,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a'] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    // git_tag は subscribes 外なので無視される
    await resolver.onEvent({ kind: 'git_tag', repo: 'a', tag: 'v1', commitHash: 'h' }, ctx);
    await resolver.onRunEnd(ctx);

    expect(state.resolveCommitsCalls).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it('logs error for each failing resolveCommits call', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => { throw new Error('git blame error'); },
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a'] });
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 'sx',
      messageCount: 1,
      repoName: 'r',
    }, ctx);

    expect(errors.some((e) => e.includes('git blame error'))).toBe(true);
    expect(resolver.getCommitsResolved()).toBe(0);
  });

  it('handles non-Error thrown object via String(err) fallback', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => { throw 'non-error-string'; },
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a'] });
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };

    await resolver.onRunStart(ctx);
    await resolver.onEvent({
      kind: 'session_imported',
      sessionId: 'sy',
      messageCount: 1,
      repoName: 'r',
    }, ctx);

    expect(errors.some((e) => e.includes('non-error-string'))).toBe(true);
  });

  it('resets commitsResolved counter on each onRunStart', async () => {
    const state: FakeDbState = {
      resolveCommitsCalls: [],
      resolutionsDone: new Set(),
      resolveCommitsImpl: () => 5,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new CommitResolver({ trailDb, gitRoots: ['/repo/a'] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' }, ctx);
    expect(resolver.getCommitsResolved()).toBe(5);

    await resolver.onRunStart(ctx);
    expect(resolver.getCommitsResolved()).toBe(0);
  });
});
