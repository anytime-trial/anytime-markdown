import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { PersistAnalyzer } from '../PersistAnalyzer';

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

describe('PersistAnalyzer', () => {
  it('calls trailDb.save() at onRunEnd', async () => {
    let saved = 0;
    const trailDb = { save: () => { saved += 1; } } as unknown as TrailDatabase;
    const persist = new PersistAnalyzer({ trailDb });
    const { bus } = makeBus();
    await persist.onRunEnd(makeCtx(bus));
    expect(saved).toBe(1);
  });

  it('propagates save() errors (orchestrator collects as Persist error)', async () => {
    const trailDb = { save: () => { throw new Error('disk full'); } } as unknown as TrailDatabase;
    const persist = new PersistAnalyzer({ trailDb });
    const { bus } = makeBus();
    await expect(persist.onRunEnd(makeCtx(bus))).rejects.toThrow('disk full');
  });

  it('exposes id=Persist, tier=2, empty subscribes/emits', () => {
    const persist = new PersistAnalyzer({ trailDb: {} as unknown as TrailDatabase });
    expect(persist.id).toBe('Persist');
    expect(persist.tier).toBe(2);
    expect(persist.subscribes).toEqual([]);
    expect(persist.emits).toEqual([]);
  });
});
