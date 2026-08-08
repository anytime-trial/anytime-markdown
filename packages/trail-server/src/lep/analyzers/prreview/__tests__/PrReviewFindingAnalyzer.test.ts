import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BetterSqlite3MemoryDb,
  runMigrations,
  type AnalyzerContext,
  type AnalyzerEvent,
  type EventBusPublisher,
  type MemoryDbConnection,
} from '@anytime-markdown/memory-core';

import { PrReviewFindingAnalyzer } from '../PrReviewFindingAnalyzer';

function makeCtx(): { ctx: AnalyzerContext; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const bus: EventBusPublisher = { publish: async () => undefined };
  return {
    logs,
    errors,
    ctx: {
      runId: 'r1',
      reason: 'manual',
      logger: {
        info: (m) => logs.push(m),
        error: (m) => errors.push(m),
        warn: (m) => logs.push(`WARN ${m}`),
      },
      bus,
    },
  };
}

const IMPORTED = (over: Record<string, unknown> = {}): AnalyzerEvent => ({
  kind: 'pr_review_imported',
  repo: 'acme/widget',
  prNumber: 7,
  reviewId: 'rev1',
  commentCount: 1,
  author: 'alice',
  state: 'CHANGES_REQUESTED',
  submittedAt: '2026-05-20T00:00:00Z',
  body: '',
  bodyHash: 'hash-a',
  comments: [{ path: 'a.ts', line: 3, body: 'guard null' }],
  ...over,
} as AnalyzerEvent);

function selectReview(db: MemoryDbConnection, sourceRef: string) {
  const rows = db.exec(
    `SELECT id, reviewer, severity_overall, source_hash FROM memory_reviews WHERE source_kind='pr_comment' AND source_ref=?`,
    [sourceRef],
  );
  const v = rows[0]?.values?.[0];
  if (!v) return null;
  return { id: String(v[0]), reviewer: String(v[1]), severityOverall: String(v[2]), sourceHash: String(v[3]) };
}

function countFindings(db: MemoryDbConnection, reviewId: string): number {
  const rows = db.exec(`SELECT COUNT(*) FROM memory_review_findings WHERE review_id=?`, [reviewId]);
  return Number(rows[0]?.values?.[0]?.[0] ?? 0);
}

describe('PrReviewFindingAnalyzer', () => {
  let dir: string;
  let memoryDb: MemoryDbConnection;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pr-review-finding-analyzer-'));
    memoryDb = new BetterSqlite3MemoryDb({ filePath: join(dir, 'caravan-book.db') });
    runMigrations(memoryDb);
  });

  afterEach(() => {
    memoryDb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('exposes a tier=2 analyzer subscribing pr_review_imported', () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    expect(a.tier).toBe(2);
    expect(a.subscribes).toEqual(['pr_review_imported']);
    expect(a.emits).toEqual([]);
  });

  it('extracts findings from comments and persists review + findings via ingestPrReview', async () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    const { ctx } = makeCtx();

    await a.onEvent(IMPORTED(), ctx);

    const review = selectReview(memoryDb, 'widget#pr7#rev1');
    expect(review).not.toBeNull();
    expect(review?.reviewer).toBe('alice');
    expect(review?.sourceHash).toBe('hash-a');
    expect(countFindings(memoryDb, review!.id)).toBe(1);
    expect(a.getCounters()).toEqual({ reviewsProcessed: 1, findingsWritten: 1 });
  });

  it('still persists a review with 0 findings for an approval with no comments', async () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    const { ctx } = makeCtx();
    await a.onEvent(IMPORTED({ reviewId: 'rev2', state: 'APPROVED', body: 'lgtm', comments: [], bodyHash: 'hash-b' }), ctx);

    const review = selectReview(memoryDb, 'widget#pr7#rev2');
    expect(review).not.toBeNull();
    expect(review?.severityOverall).toBe('info');
    expect(countFindings(memoryDb, review!.id)).toBe(0);
    expect(a.getCounters()).toEqual({ reviewsProcessed: 1, findingsWritten: 0 });
  });

  it('uses the optional classifier and stores severity/category on the persisted finding', async () => {
    const a = new PrReviewFindingAnalyzer({
      memoryDb,
      classify: () => ({ severity: 'error', category: 'security' }),
    });
    const { ctx } = makeCtx();
    await a.onEvent(IMPORTED({ reviewId: 'rev3', bodyHash: 'hash-c', comments: [{ path: 'x.ts', line: 1, body: 'sql injection' }] }), ctx);

    const review = selectReview(memoryDb, 'widget#pr7#rev3');
    expect(review?.severityOverall).toBe('error');
    const rows = memoryDb.exec(
      `SELECT severity, category FROM memory_review_findings WHERE review_id=?`,
      [review!.id],
    );
    expect(rows[0]?.values).toEqual([['error', 'security']]);
  });

  it('is idempotent: re-processing the same bodyHash does not duplicate findings', async () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    const { ctx } = makeCtx();
    await a.onEvent(IMPORTED(), ctx);
    await a.onEvent(IMPORTED(), ctx);

    const review = selectReview(memoryDb, 'widget#pr7#rev1');
    expect(countFindings(memoryDb, review!.id)).toBe(1);
  });

  it('ignores unrelated events', async () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    const { ctx } = makeCtx();
    await a.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(selectReview(memoryDb, 'widget#pr7#rev1')).toBeNull();
  });

  it('logs error and does not throw when the classifier throws', async () => {
    const a = new PrReviewFindingAnalyzer({
      memoryDb,
      classify: () => { throw new Error('classifier boom'); },
    });
    const { ctx, errors } = makeCtx();
    await expect(a.onEvent(IMPORTED(), ctx)).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[PrReviewFindingAnalyzer] failed for review rev1: classifier boom');
    expect(selectReview(memoryDb, 'widget#pr7#rev1')).toBeNull();
  });

  it('handles non-Error thrown value (string) in catch', async () => {
    const a = new PrReviewFindingAnalyzer({
      memoryDb,
      classify: () => { throw 'quota-exceeded'; },
    });
    const { ctx, errors } = makeCtx();
    await expect(a.onEvent(IMPORTED(), ctx)).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[PrReviewFindingAnalyzer] failed for review rev1: quota-exceeded');
  });

  it('onRunEnd logs summary and resets counters', async () => {
    const a = new PrReviewFindingAnalyzer({ memoryDb });
    const { ctx, logs } = makeCtx();
    await a.onEvent(IMPORTED(), ctx);
    expect(a.getCounters()).toEqual({ reviewsProcessed: 1, findingsWritten: 1 });
    await a.onRunEnd(ctx);
    expect(logs.join('\n')).toContain('[PrReviewFindingAnalyzer] done (reviews=1, findings=1)');
    expect(a.getCounters()).toEqual({ reviewsProcessed: 0, findingsWritten: 0 });
  });
});
