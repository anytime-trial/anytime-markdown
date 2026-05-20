import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { PrReviewDetail, PrReviewFindingRow } from '@anytime-markdown/trail-db';

import {
  PrReviewFindingAnalyzer,
  type PrReviewFindingDataSource,
} from '../PrReviewFindingAnalyzer';

function makeCtx(): { ctx: AnalyzerContext; logs: string[] } {
  const logs: string[] = [];
  const bus: EventBusPublisher = { publish: async () => undefined };
  return {
    logs,
    ctx: {
      runId: 'r1',
      reason: 'manual',
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`), warn: (m) => logs.push(`WARN ${m}`) },
      bus,
    },
  };
}

function makeDs(detail: PrReviewDetail | null): {
  ds: PrReviewFindingDataSource;
  writes: { reviewId: string; findings: PrReviewFindingRow[] }[];
} {
  const writes: { reviewId: string; findings: PrReviewFindingRow[] }[] = [];
  return {
    writes,
    ds: {
      getPrReviewDetail: () => detail,
      replacePrReviewFindings: (reviewId, findings) => { writes.push({ reviewId, findings: [...findings] }); },
    },
  };
}

const NOW = () => new Date('2026-05-20T00:00:00.000Z');
const IMPORTED = (reviewId = 'rev1'): AnalyzerEvent => ({
  kind: 'pr_review_imported',
  repo: 'acme/widget',
  prNumber: 7,
  reviewId,
  commentCount: 1,
});

describe('PrReviewFindingAnalyzer', () => {
  it('exposes a tier=2 analyzer subscribing pr_review_imported', () => {
    const { ds } = makeDs(null);
    const a = new PrReviewFindingAnalyzer({ trailDb: ds });
    expect(a.tier).toBe(2);
    expect(a.subscribes).toEqual(['pr_review_imported']);
    expect(a.emits).toEqual([]);
  });

  it('extracts findings from comments and writes pr_review_findings', async () => {
    const { ds, writes } = makeDs({
      reviewId: 'rev1',
      repoName: 'widget',
      prNumber: 7,
      state: 'CHANGES_REQUESTED',
      body: '',
      comments: [{ path: 'a.ts', line: 3, body: 'guard null' }],
    });
    const a = new PrReviewFindingAnalyzer({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();

    await a.onEvent(IMPORTED(), ctx);

    expect(writes).toHaveLength(1);
    expect(writes[0].reviewId).toBe('rev1');
    expect(writes[0].findings).toEqual([
      {
        findingId: 'rev1#c0',
        reviewId: 'rev1',
        filePath: 'a.ts',
        lineNumber: 3,
        severity: null,
        category: null,
        body: 'guard null',
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    ]);
    expect(a.getCounters()).toEqual({ reviewsProcessed: 1, findingsWritten: 1 });
  });

  it('writes an empty finding set (still calls replace) for an approval with no comments', async () => {
    const { ds, writes } = makeDs({
      reviewId: 'rev2',
      repoName: 'widget',
      prNumber: 7,
      state: 'APPROVED',
      body: 'lgtm',
      comments: [],
    });
    const a = new PrReviewFindingAnalyzer({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();
    await a.onEvent(IMPORTED('rev2'), ctx);
    expect(writes).toEqual([{ reviewId: 'rev2', findings: [] }]);
  });

  it('uses the optional classifier', async () => {
    const { ds, writes } = makeDs({
      reviewId: 'rev3',
      repoName: 'widget',
      prNumber: 7,
      state: 'CHANGES_REQUESTED',
      body: '',
      comments: [{ path: 'x.ts', line: 1, body: 'sql injection' }],
    });
    const a = new PrReviewFindingAnalyzer({
      trailDb: ds,
      now: NOW,
      classify: () => ({ severity: 'error', category: 'security' }),
    });
    const { ctx } = makeCtx();
    await a.onEvent(IMPORTED('rev3'), ctx);
    expect(writes[0].findings[0]).toMatchObject({ severity: 'error', category: 'security' });
  });

  it('warns and skips when the review detail is missing', async () => {
    const { ds, writes } = makeDs(null);
    const a = new PrReviewFindingAnalyzer({ trailDb: ds, now: NOW });
    const { ctx, logs } = makeCtx();
    await a.onEvent(IMPORTED('ghost'), ctx);
    expect(writes).toEqual([]);
    expect(logs.join('\n')).toContain('review ghost not found');
  });

  it('ignores unrelated events', async () => {
    const { ds, writes } = makeDs(null);
    const a = new PrReviewFindingAnalyzer({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();
    await a.onEvent({ kind: 'session_imported', sessionId: 's', messageCount: 1, repoName: 'r' }, ctx);
    expect(writes).toEqual([]);
  });
});
