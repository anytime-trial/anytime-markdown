import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { PrReviewUpsert } from '@anytime-markdown/trail-db';

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

function makeDs(bodyHashes: Record<string, string> = {}): {
  ds: PrReviewImporterDataSource;
  upserts: PrReviewUpsert[];
} {
  const upserts: PrReviewUpsert[] = [];
  return {
    upserts,
    ds: {
      getPrReviewBodyHash: (id) => bodyHashes[id] ?? null,
      upsertPrReview: (r) => { upserts.push(r); },
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
    const imp = new PrReviewImporter({ trailDb: ds });
    expect(imp.id).toBe('PrReviewImporter');
    expect(imp.tier).toBe(2);
    expect(imp.subscribes).toEqual(['github_pr_review']);
    expect(imp.emits).toEqual(['pr_review_imported']);
  });

  it('upserts a new review (repo_name = name part) and emits pr_review_imported', async () => {
    const { ds, upserts } = makeDs();
    const imp = new PrReviewImporter({ trailDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT(), ctx);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ reviewId: '100', repoName: 'widget', prNumber: 7, bodyHash: 'hash-v1' });
    expect(events).toEqual([
      { kind: 'pr_review_imported', repo: 'acme/widget', prNumber: 7, reviewId: '100', commentCount: 1 },
    ]);
    expect(imp.getCounters()).toEqual({ imported: 1, skipped: 0 });
  });

  it('skips re-import when body_hash is unchanged (idempotent)', async () => {
    const { ds, upserts } = makeDs({ '100': 'hash-v1' });
    const imp = new PrReviewImporter({ trailDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT({ bodyHash: 'hash-v1' }), ctx);

    expect(upserts).toEqual([]);
    expect(events).toEqual([]);
    expect(imp.getCounters()).toEqual({ imported: 0, skipped: 1 });
  });

  it('re-imports when body_hash changed', async () => {
    const { ds, upserts } = makeDs({ '100': 'hash-OLD' });
    const imp = new PrReviewImporter({ trailDb: ds });
    const { ctx, events } = makeCtx();

    await imp.onEvent(REVIEW_EVENT({ bodyHash: 'hash-v2' }), ctx);

    expect(upserts).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('ignores non-github_pr_review events', async () => {
    const { ds, upserts } = makeDs();
    const imp = new PrReviewImporter({ trailDb: ds });
    const { ctx } = makeCtx();
    await imp.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(upserts).toEqual([]);
  });

  it('logs and continues when upsert throws', async () => {
    const ds: PrReviewImporterDataSource = {
      getPrReviewBodyHash: () => null,
      upsertPrReview: () => { throw new Error('locked'); },
    };
    const imp = new PrReviewImporter({ trailDb: ds });
    const { ctx, events, logs } = makeCtx();
    await imp.onEvent(REVIEW_EVENT(), ctx);
    expect(events).toEqual([]);
    expect(logs.join('\n')).toContain('[PrReviewImporter] failed for review 100: locked');
  });
});
