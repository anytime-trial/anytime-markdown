import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { ReleaseResolver } from '../ReleaseResolver';

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
  resolveReleasesCalls: string[];
  resolveReleasesImpl: (gitRoot: string) => number;
  resolveReleaseTimesCalls: number;
  resolveReleaseTimesImpl: () => number;
}

function makeFakeTrailDb(state: FakeDbState): TrailDatabase {
  return {
    resolveReleases: (gitRoot: string) => {
      state.resolveReleasesCalls.push(gitRoot);
      return state.resolveReleasesImpl(gitRoot);
    },
    resolveReleaseTimes: () => {
      state.resolveReleaseTimesCalls += 1;
      return state.resolveReleaseTimesImpl();
    },
  } as unknown as TrailDatabase;
}

describe('ReleaseResolver', () => {
  it('aggregates git_tag events and calls resolveReleases once at run end', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 3,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 2,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new ReleaseResolver({ trailDb, gitRoots: ['/work/anytime-markdown'] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1.0.0', commitHash: 'a1' },
      ctx,
    );
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1.1.0', commitHash: 'a2' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    expect(state.resolveReleasesCalls).toEqual(['/work/anytime-markdown']);
    expect(state.resolveReleaseTimesCalls).toBe(1);
    expect(resolver.getReleasesResolved()).toBe(3);
    const releases = events.filter((e) => e.kind === 'release_resolved');
    expect(releases).toHaveLength(2);
    const tags = releases.map((e) => (e.kind === 'release_resolved' ? e.tag : '')).sort();
    expect(tags).toEqual(['v1.0.0', 'v1.1.0']);
  });

  it('skips tags for non-primary repos', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 1,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const trailDb = makeFakeTrailDb(state);
    const resolver = new ReleaseResolver({ trailDb, gitRoots: ['/work/primary'] });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({ kind: 'git_tag', repo: 'other-repo', tag: 'v9', commitHash: 'x' }, ctx);
    await resolver.onRunEnd(ctx);

    expect(state.resolveReleasesCalls).toEqual([]);
    expect(events.filter((e) => e.kind === 'release_resolved')).toEqual([]);
  });

  it('does nothing when gitRoots is empty', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 0,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const phaseEvents: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: [],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent({ kind: 'git_tag', repo: 'r', tag: 'v1', commitHash: 'h' }, ctx);
    await resolver.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['resolve_releases:skip']);
    expect(events).toEqual([]);
  });

  it('fires onPhase start + finish', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 2,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 1,
    };
    const phaseEvents: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['resolve_releases:start', 'resolve_releases:finish']);
  });

  it('continues to resolveReleaseTimes even if resolveReleases throws', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => { throw new Error('git error'); },
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const phaseEvents: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    expect(state.resolveReleaseTimesCalls).toBe(1);
    expect(phaseEvents).toEqual(['resolve_releases:start', 'resolve_releases:error']);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const resolver = new ReleaseResolver({
      trailDb: {} as unknown as TrailDatabase,
      gitRoots: [],
    });
    expect(resolver.tier).toBe(2);
    expect(resolver.id).toBe('ReleaseResolver');
    expect(resolver.subscribes).toEqual(['git_tag']);
    expect(resolver.emits).toEqual(['release_resolved']);
  });

  it('fires error phase when resolveReleaseTimes throws (but resolveReleases succeeded)', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 1,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => { throw new Error('times error'); },
    };
    const phaseEvents: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    expect(state.resolveReleasesCalls).toEqual(['/work/anytime-markdown']);
    expect(state.resolveReleaseTimesCalls).toBe(1);
    // resolveReleases が成功し resolveReleaseTimes が失敗 → error フェーズが発火する
    expect(phaseEvents).toEqual(['resolve_releases:start', 'resolve_releases:error']);
  });

  it('skips when gitRoot is present but no git_tag events were received', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 0,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const phaseEvents: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    // no git_tag events
    await resolver.onRunEnd(ctx);

    // tagsByRoot is empty → skip with 'no tags' message
    expect(state.resolveReleasesCalls).toEqual([]);
    expect(events.filter((e) => e.kind === 'release_resolved')).toEqual([]);
    expect(phaseEvents).toEqual(['resolve_releases:skip']);
  });

  it('ignores non-git_tag events in onEvent', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 0,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
    });
    const { bus, events } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    // session_imported は git_tag ではないので無視される
    await resolver.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' } as unknown as import('@anytime-markdown/memory-core').AnalyzerEvent, ctx);
    await resolver.onRunEnd(ctx);

    expect(state.resolveReleasesCalls).toEqual([]);
    expect(events.filter((e) => e.kind === 'release_resolved')).toEqual([]);
  });

  it('handles non-Error thrown by resolveReleases via String(err) fallback', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => { throw 'non-error-resolve'; },
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 0,
    };
    const phaseEvents: Array<{ action: string; message?: string }> = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push({ action: e.action, message: 'message' in e ? e.message : undefined }),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    const errorPhase = phaseEvents.find((e) => e.action === 'error');
    expect(errorPhase).toBeDefined();
  });

  it('handles non-Error thrown by resolveReleaseTimes via String(err) fallback', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 1,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => { throw 'non-error-times'; },
    };
    const phaseEvents: Array<{ action: string; message?: string }> = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onPhase: (e) => phaseEvents.push({ action: e.action, message: 'message' in e ? e.message : undefined }),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    const errorPhase = phaseEvents.find((e) => e.action === 'error');
    expect(errorPhase).toBeDefined();
  });

  it('passes onProgress messages during resolve', async () => {
    const state: FakeDbState = {
      resolveReleasesCalls: [],
      resolveReleasesImpl: () => 2,
      resolveReleaseTimesCalls: 0,
      resolveReleaseTimesImpl: () => 1,
    };
    const progressMessages: string[] = [];
    const resolver = new ReleaseResolver({
      trailDb: makeFakeTrailDb(state),
      gitRoots: ['/work/anytime-markdown'],
      onProgress: (msg) => progressMessages.push(msg),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await resolver.onRunStart(ctx);
    await resolver.onEvent(
      { kind: 'git_tag', repo: 'anytime-markdown', tag: 'v1', commitHash: 'h' },
      ctx,
    );
    await resolver.onRunEnd(ctx);

    expect(progressMessages).toContain('Resolving releases from version tags...');
    expect(progressMessages).toContain('Releases resolved: 2');
    expect(progressMessages).toContain('Resolving release times...');
    expect(progressMessages).toContain('Release times resolved: 1');
  });
});
