import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { CommitFilesBackfiller } from '../CommitFilesBackfiller';

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

describe('CommitFilesBackfiller', () => {
  it('calls backfillCommitFilesPublic once at onRunEnd with primary gitRoot', async () => {
    const calls: string[] = [];
    const trailDb = {
      backfillCommitFilesPublic: (gitRoot: string) => { calls.push(gitRoot); },
    } as unknown as TrailDatabase;
    const backfiller = new CommitFilesBackfiller({ trailDb, gitRoots: ['/work/a', '/work/b'] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await backfiller.onEvent({ kind: 'commit_resolved', sessionId: 's1', repoName: 'a', hashes: [] }, ctx);
    await backfiller.onEvent({ kind: 'commit_resolved', sessionId: 's2', repoName: 'a', hashes: [] }, ctx);
    await backfiller.onRunEnd(ctx);

    expect(calls).toEqual(['/work/a']); // primary only, once
  });

  it('skips when no gitRoot', async () => {
    const backfill = jest.fn();
    const trailDb = { backfillCommitFilesPublic: backfill } as unknown as TrailDatabase;
    const backfiller = new CommitFilesBackfiller({ trailDb, gitRoots: [] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await backfiller.onRunEnd(ctx);

    expect(backfill).not.toHaveBeenCalled();
  });

  it('does not throw when backfill fails (non-fatal)', async () => {
    const trailDb = {
      backfillCommitFilesPublic: () => { throw new Error('git error'); },
    } as unknown as TrailDatabase;
    const backfiller = new CommitFilesBackfiller({ trailDb, gitRoots: ['/work/a'] });
    const { bus } = makeBus();
    const ctx = makeCtx(bus);

    await backfiller.onRunStart(ctx);
    await expect(backfiller.onRunEnd(ctx)).resolves.toBeUndefined();
  });

  it('exposes tier=2 with correct subscribes/emits', () => {
    const backfiller = new CommitFilesBackfiller({ trailDb: {} as unknown as TrailDatabase, gitRoots: [] });
    expect(backfiller.tier).toBe(2);
    expect(backfiller.id).toBe('CommitFilesBackfiller');
    expect(backfiller.subscribes).toEqual(['commit_resolved']);
    expect(backfiller.emits).toEqual([]);
  });
});
