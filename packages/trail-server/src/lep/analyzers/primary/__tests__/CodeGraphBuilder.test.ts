import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CodeGraphBuilder } from '../CodeGraphBuilder';

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

const fakeAnalyzeFn = (() => ({ nodes: [], edges: [] })) as unknown as NonNullable<
  Parameters<TrailDatabase['importAll']>[3]
>;

describe('CodeGraphBuilder', () => {
  it('calls analyzeReleases once at onRunEnd when gitRoot + analyzeFn present', async () => {
    const calls: Array<{ gitRoot: string }> = [];
    const trailDb = {
      analyzeReleases: (gitRoot: string) => {
        calls.push({ gitRoot });
        return 2;
      },
    } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onEvent({ kind: 'release_resolved', tag: 'v1', releasedAt: '' }, ctx);
    await builder.onRunEnd(ctx);

    expect(calls).toEqual([{ gitRoot: '/work/anytime-markdown' }]);
    expect(builder.getReleasesAnalyzed()).toBe(2);
  });

  it('fires onPhase start + finish', async () => {
    const phaseEvents: string[] = [];
    const trailDb = { analyzeReleases: () => 1 } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['analyze_releases:start', 'analyze_releases:finish']);
  });

  it('skips when no gitRoot', async () => {
    const phaseEvents: string[] = [];
    const analyzeReleases = jest.fn(() => 0);
    const trailDb = { analyzeReleases } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: [],
      analyzeFn: fakeAnalyzeFn,
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(analyzeReleases).not.toHaveBeenCalled();
    expect(phaseEvents).toEqual(['analyze_releases:skip']);
  });

  it('skips when no analyzeFn', async () => {
    const phaseEvents: string[] = [];
    const analyzeReleases = jest.fn(() => 0);
    const trailDb = { analyzeReleases } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      // analyzeFn omitted
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(analyzeReleases).not.toHaveBeenCalled();
    expect(phaseEvents).toEqual(['analyze_releases:skip']);
  });

  it('emits error phase when analyzeReleases throws', async () => {
    const phaseEvents: string[] = [];
    const trailDb = {
      analyzeReleases: () => { throw new Error('worktree failed'); },
    } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['analyze_releases:start', 'analyze_releases:error']);
  });

  it('exposes tier=2, inputMode=self-read, correct subscribes/emits', () => {
    const builder = new CodeGraphBuilder({
      trailDb: {} as unknown as TrailDatabase,
      gitRoots: [],
    });
    expect(builder.tier).toBe(2);
    expect(builder.inputMode).toBe('self-read');
    expect(builder.id).toBe('CodeGraphBuilder');
    expect(builder.subscribes).toEqual(['release_resolved']);
    expect(builder.emits).toEqual([]);
  });

  it('passes internal progress callback to analyzeReleases and invokes onProgress', async () => {
    const progressFromAnalyze: string[] = [];
    let capturedProgressCb: ((msg: string) => void) | undefined;
    const trailDb = {
      analyzeReleases: (
        _gitRoot: string,
        _analyzeFn: unknown,
        progressCb: (msg: string) => void,
      ) => {
        capturedProgressCb = progressCb;
        progressCb('analyzing tag v1.0.0');
        return 1;
      },
    } as unknown as TrailDatabase;

    const onProgressCalls: string[] = [];
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
      onProgress: (msg) => { onProgressCalls.push(msg); progressFromAnalyze.push(msg); },
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onEvent({ kind: 'release_resolved', tag: 'v1', releasedAt: '' }, ctx);
    await builder.onRunEnd(ctx);

    // analyzeReleases に渡された内部 callback が実際に呼ばれた
    expect(capturedProgressCb).toBeDefined();
    expect(onProgressCalls).toContain('analyzing tag v1.0.0');
    expect(onProgressCalls).toContain('Analyzing releases...');
    expect(onProgressCalls).toContain('Releases analyzed: 1');
  });

  it('counts resolvedCount from release_resolved events', async () => {
    const trailDb = { analyzeReleases: () => 3 } as unknown as TrailDatabase;
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onEvent({ kind: 'release_resolved', tag: 'v1', releasedAt: '' }, ctx);
    await builder.onEvent({ kind: 'release_resolved', tag: 'v2', releasedAt: '' }, ctx);
    // non-matching event is ignored
    await builder.onEvent({ kind: 'git_tag', repo: 'r', tag: 'v3', commitHash: 'h' }, ctx);
    await builder.onRunEnd(ctx);

    expect(builder.getReleasesAnalyzed()).toBe(3);
  });

  it('logs non-Error thrown objects via String(err) fallback in error phase', async () => {
    const phaseEvents: string[] = [];
    const trailDb = {
      analyzeReleases: () => { throw 'non-error-value'; },
    } as unknown as TrailDatabase;
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };
    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/anytime-markdown'],
      analyzeFn: fakeAnalyzeFn,
      onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`),
    });

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['analyze_releases:start', 'analyze_releases:error']);
    expect(errors.some((e) => e.includes('non-error-value'))).toBe(true);
  });

  it('passes excludePatterns to analyzeReleases', async () => {
    const capturedArgs: Array<{ gitRoot: string; excludePatterns: readonly string[] | undefined }> = [];
    const trailDb = {
      analyzeReleases: (
        gitRoot: string,
        _analyzeFn: unknown,
        _progressCb: unknown,
        excludePatterns: readonly string[] | undefined,
      ) => {
        capturedArgs.push({ gitRoot, excludePatterns });
        return 1;
      },
    } as unknown as TrailDatabase;

    const builder = new CodeGraphBuilder({
      trailDb,
      gitRoots: ['/work/repo'],
      analyzeFn: fakeAnalyzeFn,
      excludePatterns: ['node_modules', 'dist'],
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await builder.onRunStart(ctx);
    await builder.onRunEnd(ctx);

    expect(capturedArgs).toHaveLength(1);
    expect(capturedArgs[0].excludePatterns).toEqual(['node_modules', 'dist']);
  });
});
