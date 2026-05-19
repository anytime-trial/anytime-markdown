import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { MessageCommitMatcher } from '../MessageCommitMatcher';

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

describe('MessageCommitMatcher', () => {
  it('calls backfillMessageCommits once at onRunEnd and tracks count', async () => {
    let calls = 0;
    const trailDb = {
      backfillMessageCommits: () => { calls += 1; return 7; },
    } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await matcher.onRunStart(ctx);
    await matcher.onEvent({ kind: 'commit_resolved', sessionId: 's1', repoName: 'a', hashes: [] }, ctx);
    await matcher.onRunEnd(ctx);

    expect(calls).toBe(1);
    expect(matcher.getMessageCommitsBackfilled()).toBe(7);
  });

  it('does not throw when backfill fails (non-fatal)', async () => {
    const trailDb = {
      backfillMessageCommits: () => { throw new Error('jsonl read error'); },
    } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await matcher.onRunStart(ctx);
    await expect(matcher.onRunEnd(ctx)).resolves.toBeUndefined();
    expect(matcher.getMessageCommitsBackfilled()).toBe(0);
  });

  it('resets count on subsequent onRunStart', async () => {
    const trailDb = { backfillMessageCommits: () => 3 } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await matcher.onRunStart(ctx);
    await matcher.onRunEnd(ctx);
    expect(matcher.getMessageCommitsBackfilled()).toBe(3);

    await matcher.onRunStart(ctx);
    expect(matcher.getMessageCommitsBackfilled()).toBe(0);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const matcher = new MessageCommitMatcher({ trailDb: {} as unknown as TrailDatabase });
    expect(matcher.tier).toBe(2);
    expect(matcher.id).toBe('MessageCommitMatcher');
    expect(matcher.subscribes).toEqual(['commit_resolved']);
    expect(matcher.emits).toEqual([]);
  });
});
