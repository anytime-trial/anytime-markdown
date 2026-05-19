import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CostRebuilder } from '../CostRebuilder';

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

describe('CostRebuilder', () => {
  it('calls rebuildSessionCostsPublic once at onRunEnd regardless of event count', async () => {
    let rebuildCalls = 0;
    const trailDb = {
      rebuildSessionCostsPublic: () => { rebuildCalls += 1; },
    } as unknown as TrailDatabase;
    const rebuilder = new CostRebuilder({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunStart(ctx);
    await rebuilder.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' }, ctx);
    await rebuilder.onEvent({ kind: 'session_imported', sessionId: 's2', messageCount: 1, repoName: 'r' }, ctx);
    await rebuilder.onEvent({ kind: 'session_imported', sessionId: 's3', messageCount: 1, repoName: 'r' }, ctx);
    await rebuilder.onRunEnd(ctx);

    expect(rebuildCalls).toBe(1);
  });

  it('fires onPhase start + finish', async () => {
    const phaseEvents: string[] = [];
    const trailDb = { rebuildSessionCostsPublic: () => undefined } as unknown as TrailDatabase;
    const rebuilder = new CostRebuilder({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunStart(ctx);
    await rebuilder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['rebuild_costs:start', 'rebuild_costs:finish']);
  });

  it('emits error phase when rebuild throws', async () => {
    const phaseEvents: string[] = [];
    const trailDb = {
      rebuildSessionCostsPublic: () => { throw new Error('SQL error'); },
    } as unknown as TrailDatabase;
    const rebuilder = new CostRebuilder({ trailDb, onPhase: (e) => phaseEvents.push(`${e.phase}:${e.action}`) });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await rebuilder.onRunStart(ctx);
    await rebuilder.onRunEnd(ctx);

    expect(phaseEvents).toEqual(['rebuild_costs:start', 'rebuild_costs:error']);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const rebuilder = new CostRebuilder({ trailDb: {} as unknown as TrailDatabase });
    expect(rebuilder.tier).toBe(2);
    expect(rebuilder.id).toBe('CostRebuilder');
    expect(rebuilder.subscribes).toEqual(['session_imported']);
    expect(rebuilder.emits).toEqual([]);
  });
});
