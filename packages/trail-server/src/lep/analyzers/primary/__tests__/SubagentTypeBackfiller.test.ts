import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { SubagentTypeBackfiller } from '../SubagentTypeBackfiller';

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

describe('SubagentTypeBackfiller', () => {
  it('calls backfillSubagentTypePublic once at onRunEnd', async () => {
    let calls = 0;
    const trailDb = {
      backfillSubagentTypePublic: () => { calls += 1; },
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await backfiller.onEvent({ kind: 'meta_json', sessionId: 's1', agentId: 'a', agentType: 'x', filePath: '/p' }, ctx);
    await backfiller.onEvent({ kind: 'meta_json', sessionId: 's2', agentId: 'b', agentType: 'y', filePath: '/q' }, ctx);
    await backfiller.onRunEnd(ctx);

    expect(calls).toBe(1);
  });

  it('does not throw when backfill fails (non-fatal)', async () => {
    const trailDb = {
      backfillSubagentTypePublic: () => { throw new Error('fs error'); },
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await expect(backfiller.onRunEnd(ctx)).resolves.toBeUndefined();
  });

  it('exposes tier=2, inputMode=self-read, correct subscribes/emits', () => {
    const backfiller = new SubagentTypeBackfiller({ trailDb: {} as unknown as TrailDatabase });
    expect(backfiller.tier).toBe(2);
    expect(backfiller.inputMode).toBe('self-read');
    expect(backfiller.id).toBe('SubagentTypeBackfiller');
    expect(backfiller.subscribes).toEqual(['meta_json']);
    expect(backfiller.emits).toEqual([]);
  });
});
