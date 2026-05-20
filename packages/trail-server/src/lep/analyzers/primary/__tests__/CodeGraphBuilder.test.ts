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
});
