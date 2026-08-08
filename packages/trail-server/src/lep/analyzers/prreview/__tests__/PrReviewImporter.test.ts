import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/trail-caravan-book';

import { PrReviewImporter, type PrReviewImporterDataSource } from '../PrReviewImporter';

function makeCtx(): { ctx: AnalyzerContext; events: AnalyzerEvent[]; logs: string[] } {
  const events: AnalyzerEvent[] = [];
  const logs: string[] = [];
  const bus: EventBusPublisher = { publish: async (e) => { events.push(e); } };
  return {
    events,
    logs,
    ctx: {
      runId: 'r1',
      reason: 'manual',
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`) },
      bus,
    },
  };
}

function makeDs(sourceHashes: Record<string, string> = {}): {
  ds: PrReviewImporterDataSource;
  lookups: string[];
} {
  const lookups: string[] = [];
  return {
    lookups,
    ds: {
      getReviewSourceHash: (sourceRef) => {
        lookups.push(sourceRef);
        return sourceHashes[sourceRef] ?? null;
      },
    },
  };
}

const REVIEW_EVENT = (over: Record<string, unknown> = {}): AnalyzerEvent => ({
  kind: 'github_pr_review',
  repo: 'acme/widget',
  prNumber: 7,
  reviewId: '100',
  author: 'alice',
  state: 'CHANGES_REQUESTED',
  submittedAt: '2026-01-10T00:00:00Z',
  body: 'fix please',
  bodyHash: 'hash-v1',
  comments: [{ path: 'a.ts', line: 1, body: 'nit' }],
  ...over,
} as AnalyzerEvent);

describe('PrReviewImporter', () => {
  it('exposes a tier=2 analyzer', () => {
    const { ds } = makeDs();
    const imp = new PrReviewImporter({ memoryDb: ds });
    expect(imp.id).toBe('PrReviewImporter');
    expect(imp.tier).toBe(2);
    expect(imp.subscribes).toEqual(['github_pr_review']);
    expect(imp.emits).toEqual(['pr_review_imported']);
  });

  it('emits pr_review_imported with the full review payload when unseen (repo_name = name part)', async () => {
    const { ds, lookups } = makeDs();
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT(), ctx);

    expect(lookups).toEqual(['widget#pr7#100']);
    expect(events).toEqual([
      {
        kind: 'pr_review_imported',
        repo: 'acme/widget',
        prNumber: 7,
        reviewId: '100',
        commentCount: 1,
        author: 'alice',
        state: 'CHANGES_REQUESTED',
        submittedAt: '2026-01-10T00:00:00Z',
        body: 'fix please',
        bodyHash: 'hash-v1',
        comments: [{ path: 'a.ts', line: 1, body: 'nit' }],
      },
    ]);
    expect(imp.getCounters()).toEqual({ imported: 1, skipped: 0 });
  });

  it('skips re-import when source_hash is unchanged (idempotent)', async () => {
    const { ds } = makeDs({ 'widget#pr7#100': 'hash-v1' });
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT({ bodyHash: 'hash-v1' }), ctx);

    expect(events).toEqual([]);
    expect(imp.getCounters()).toEqual({ imported: 0, skipped: 1 });
  });

  it('re-emits when source_hash changed', async () => {
    const { ds } = makeDs({ 'widget#pr7#100': 'hash-OLD' });
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT({ bodyHash: 'hash-v2' }), ctx);

    expect(events).toHaveLength(1);
    expect(imp.getCounters()).toEqual({ imported: 1, skipped: 0 });
  });

  it('ignores non-github_pr_review events', async () => {
    const { ds, lookups } = makeDs();
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx } = makeCtx();
    await imp.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(lookups).toEqual([]);
  });

  it('logs and continues when the source_hash lookup throws', async () => {
    const ds: PrReviewImporterDataSource = {
      getReviewSourceHash: () => { throw new Error('locked'); },
    };
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, events, logs } = makeCtx();
    await imp.onEvent(REVIEW_EVENT(), ctx);
    expect(events).toEqual([]);
    expect(logs.join('\n')).toContain('[PrReviewImporter] failed for review 100: locked');
  });

  it('handles non-Error thrown value (string) in catch', async () => {
    const ds: PrReviewImporterDataSource = {
      getReviewSourceHash: () => { throw 'db-gone'; },
    };
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, logs } = makeCtx();
    await imp.onEvent(REVIEW_EVENT(), ctx);
    expect(logs.join('\n')).toContain('[PrReviewImporter] failed for review 100: db-gone');
  });

  it('onRunEnd logs summary and resets counters', async () => {
    const { ds } = makeDs();
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx, logs } = makeCtx();

    await imp.onEvent(REVIEW_EVENT(), ctx);
    expect(imp.getCounters()).toEqual({ imported: 1, skipped: 0 });

    await imp.onRunEnd(ctx);
    expect(logs.join('\n')).toContain('[PrReviewImporter] done (imported=1, skipped=0)');
    // counters reset after onRunEnd
    expect(imp.getCounters()).toEqual({ imported: 0, skipped: 0 });
  });

  it('handles repo without slash (no-op split)', async () => {
    const { ds, lookups } = makeDs();
    const imp = new PrReviewImporter({ memoryDb: ds });
    const { ctx } = makeCtx();
    await imp.onEvent(REVIEW_EVENT({ repo: 'widget' }), ctx);
    expect(lookups).toEqual(['widget#pr7#100']);
  });
});
