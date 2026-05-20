import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CountsRebuilder } from '../CountsRebuilder';

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

describe('CountsRebuilder', () => {
  it('calls rebuildDailyCountsPublic + rebuildSessionStatsPublic once at onRunEnd', async () => {
    const calls: string[] = [];
    const trailDb = {
      rebuildDailyCountsPublic: () => { calls.push('daily'); },
      rebuildSessionStatsPublic: () => { calls.push('stats'); },
    } as unknown as TrailDatabase;
    const rebuilder = new CountsRebuilder({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunEnd(ctx);

    expect(calls).toEqual(['daily', 'stats']);
  });

  it('fires onPhase start + finish', async () => {
    const phaseEvents: string[] = [];
    const trailDb = {
      rebuildDailyCountsPublic: () => undefined,
      rebuildSessionStatsPublic: () => undefined,
    } as unknown as TrailDatabase;
    const rebuilder = new CountsRebuilder({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['rebuild_counts:start', 'rebuild_counts:finish']);
  });

  it('emits error phase when daily counts throws', async () => {
    const phaseEvents: string[] = [];
    const trailDb = {
      rebuildDailyCountsPublic: () => { throw new Error('SQL error'); },
      rebuildSessionStatsPublic: () => undefined,
    } as unknown as TrailDatabase;
    const rebuilder = new CountsRebuilder({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['rebuild_counts:start', 'rebuild_counts:error']);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const rebuilder = new CountsRebuilder({ trailDb: {} as unknown as TrailDatabase });
    expect(rebuilder.tier).toBe(2);
    expect(rebuilder.id).toBe('CountsRebuilder');
    expect(rebuilder.subscribes).toEqual([]);
    expect(rebuilder.emits).toEqual([]);
  });
});
