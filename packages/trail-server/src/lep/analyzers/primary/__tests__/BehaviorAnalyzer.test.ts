import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { BehaviorAnalyzer } from '../BehaviorAnalyzer';

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

describe('BehaviorAnalyzer', () => {
  it('runs analysis for each session_imported event', async () => {
    const analyzed: string[] = [];
    const trailDb = {
      runBehaviorAnalysis: (sid: string) => { analyzed.push(sid); },
    } as unknown as TrailDatabase;
    const analyzer = new BehaviorAnalyzer({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await analyzer.onRunStart(ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'a', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'b', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onRunEnd(ctx);

    expect(analyzed).toEqual(['a', 'b']);
  });

  it('fires onPhase start (on first event) + finish', async () => {
    const phaseEvents: string[] = [];
    const trailDb = { runBehaviorAnalysis: () => undefined } as unknown as TrailDatabase;
    const analyzer = new BehaviorAnalyzer({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await analyzer.onRunStart(ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'a', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['analyze_behavior:start', 'analyze_behavior:finish']);
  });

  it('fires onPhase skip when no events received', async () => {
    const phaseEvents: string[] = [];
    const trailDb = { runBehaviorAnalysis: () => undefined } as unknown as TrailDatabase;
    const analyzer = new BehaviorAnalyzer({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await analyzer.onRunStart(ctx);
    await analyzer.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['analyze_behavior:skip']);
  });

  it('continues on per-session analysis failure', async () => {
    const trailDb = {
      runBehaviorAnalysis: (sid: string) => {
        if (sid === 'bad') throw new Error('analysis failed');
      },
    } as unknown as TrailDatabase;
    const analyzer = new BehaviorAnalyzer({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await analyzer.onRunStart(ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'good', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'bad', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'good2', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onRunEnd(ctx);
    // 失敗してもセッション 3 件全て onEvent が呼ばれる (throw が再 throw されない)
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const analyzer = new BehaviorAnalyzer({ trailDb: {} as unknown as TrailDatabase });
    expect(analyzer.tier).toBe(2);
    expect(analyzer.id).toBe('BehaviorAnalyzer');
    expect(analyzer.subscribes).toEqual(['session_imported']);
    expect(analyzer.emits).toEqual([]);
  });

  it('ignores non-session_imported events', async () => {
    const analyzed: string[] = [];
    const trailDb = {
      runBehaviorAnalysis: (sid: string) => { analyzed.push(sid); },
    } as unknown as TrailDatabase;
    const analyzer = new BehaviorAnalyzer({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await analyzer.onRunStart(ctx);
    // session_skipped は subscribes 外なので無視される
    await analyzer.onEvent({ kind: 'session_skipped', sessionId: 'x', reason: 'file_unchanged' }, ctx);
    await analyzer.onRunEnd(ctx);

    expect(analyzed).toEqual([]);
  });

  it('counts failed sessions separately and logs error message', async () => {
    const trailDb = {
      runBehaviorAnalysis: (sid: string) => {
        if (sid === 'err') throw new Error('analysis error');
      },
    } as unknown as TrailDatabase;
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };
    const analyzer = new BehaviorAnalyzer({ trailDb });

    await analyzer.onRunStart(ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'ok', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 'err', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onRunEnd(ctx);

    // エラーが ctx.logger.error に渡る
    expect(errors.some((e) => e.includes('err'))).toBe(true);
    expect(errors.some((e) => e.includes('analysis error'))).toBe(true);
  });

  it('handles non-Error thrown objects via String(err) fallback', async () => {
    const trailDb = {
      runBehaviorAnalysis: () => { throw 'string-error'; },
    } as unknown as TrailDatabase;
    const errors: string[] = [];
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg: string) => { errors.push(msg); } },
      bus: { publish: async () => undefined },
    };
    const analyzer = new BehaviorAnalyzer({ trailDb });

    await analyzer.onRunStart(ctx);
    await analyzer.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' }, ctx);
    await analyzer.onRunEnd(ctx);

    expect(errors.some((e) => e.includes('string-error'))).toBe(true);
  });
});
