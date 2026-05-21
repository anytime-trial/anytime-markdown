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

  it('ignores non-meta_json events in onEvent', async () => {
    let calls = 0;
    const trailDb = {
      backfillSubagentTypePublic: () => { calls += 1; },
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    // non-meta_json event — should be silently ignored
    await backfiller.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' }, ctx);
    await backfiller.onRunEnd(ctx);

    expect(calls).toBe(1);
  });

  it('invokes onProgress with backfilling message', async () => {
    const progressMessages: string[] = [];
    const trailDb = {
      backfillSubagentTypePublic: () => undefined,
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({
      trailDb,
      onProgress: (msg) => progressMessages.push(msg),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await backfiller.onRunEnd(ctx);

    expect(progressMessages).toContain('Backfilling subagent_type...');
  });

  it('uses String(err) in error log when non-Error is thrown', async () => {
    const errors: string[] = [];
    const trailDb = {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      backfillSubagentTypePublic: () => { throw 42; },
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({ trailDb });
    const { bus } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg) => errors.push(msg) },
      bus,
    };

    await backfiller.onRunStart(ctx);
    await expect(backfiller.onRunEnd(ctx)).resolves.toBeUndefined();

    expect(errors.some((e) => e.includes('42'))).toBe(true);
  });

  it('resets metaCount on subsequent onRunStart', async () => {
    let calls = 0;
    const trailDb = {
      backfillSubagentTypePublic: () => { calls += 1; },
    } as unknown as TrailDatabase;
    const backfiller = new SubagentTypeBackfiller({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await backfiller.onEvent({ kind: 'meta_json', sessionId: 's1', agentId: 'a', agentType: 'x', filePath: '/p' }, ctx);
    await backfiller.onRunEnd(ctx);

    await backfiller.onRunStart(ctx);
    // metaCount should be reset — no error on second run
    await backfiller.onRunEnd(ctx);

    expect(calls).toBe(2);
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
