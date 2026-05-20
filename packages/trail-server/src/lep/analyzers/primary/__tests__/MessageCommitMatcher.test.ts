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

  it('invokes onProgress with Backfilling message and passes progress callback to backfill', async () => {
    const progressMessages: string[] = [];
    const backfillProgressMessages: string[] = [];
    const trailDb = {
      backfillMessageCommits: (cb: (msg: string) => void) => {
        cb('session s1 matched');
        cb('session s2 matched');
        return 2;
      },
    } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({
      trailDb,
      onProgress: (msg) => progressMessages.push(msg),
    });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await matcher.onRunStart(ctx);
    await matcher.onRunEnd(ctx);

    expect(progressMessages).toContain('Backfilling message_commits...');
    // The callback passed to backfillMessageCommits also routes through onProgress
    expect(progressMessages).toContain('session s1 matched');
    expect(progressMessages).toContain('session s2 matched');
    expect(matcher.getMessageCommitsBackfilled()).toBe(2);
  });

  it('uses String(err) in error log when non-Error is thrown', async () => {
    const errors: string[] = [];
    const trailDb = {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      backfillMessageCommits: () => { throw 'plain string error'; },
    } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({ trailDb });
    const { bus } = makeBus();
    const ctx: AnalyzerContext = {
      runId: 'r1',
      reason: 'manual',
      logger: { info: () => undefined, error: (msg) => errors.push(msg) },
      bus,
    };

    await matcher.onRunStart(ctx);
    await expect(matcher.onRunEnd(ctx)).resolves.toBeUndefined();

    expect(errors.some((e) => e.includes('plain string error'))).toBe(true);
  });

  it('ignores non-commit_resolved events in onEvent', async () => {
    let calls = 0;
    const trailDb = {
      backfillMessageCommits: () => { calls += 1; return 0; },
    } as unknown as TrailDatabase;
    const matcher = new MessageCommitMatcher({ trailDb });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await matcher.onRunStart(ctx);
    // non-commit_resolved event should be silently ignored
    await matcher.onEvent({ kind: 'session_imported', sessionId: 's1', messageCount: 1, repoName: 'r' }, ctx);
    await matcher.onRunEnd(ctx);

    expect(calls).toBe(1);
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const matcher = new MessageCommitMatcher({ trailDb: {} as unknown as TrailDatabase });
    expect(matcher.tier).toBe(2);
    expect(matcher.id).toBe('MessageCommitMatcher');
    expect(matcher.subscribes).toEqual(['commit_resolved']);
    expect(matcher.emits).toEqual([]);
  });
});
