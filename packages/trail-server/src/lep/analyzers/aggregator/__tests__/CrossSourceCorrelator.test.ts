import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/trail-caravan-book';
import type { CrossSourceCorrelationRow } from '@anytime-markdown/trail-db';

import { CrossSourceCorrelator, type CrossSourceDataSource } from '../CrossSourceCorrelator';
import type { PrReviewCaravanSource } from '../../prreview/prReviewCaravanSource';

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
      logger: { info: (m) => logs.push(m), error: (m) => errors.push(m) },
      bus,
    },
  };
}

function makeDs(over: Partial<CrossSourceDataSource> = {}): {
  ds: CrossSourceDataSource;
  written: CrossSourceCorrelationRow[][];
  commitFileQueries: string[][];
} {
  const written: CrossSourceCorrelationRow[][] = [];
  const commitFileQueries: string[][] = [];
  const ds: CrossSourceDataSource = {
    getCorrelationSessionCommits: () => [],
    getDoraReleases: () => [],
    getCorrelationCommitFiles: (paths) => { commitFileQueries.push([...paths]); return []; },
    replaceCrossSourceCorrelations: (rows) => { written.push([...rows]); },
    ...over,
  };
  return { ds, written, commitFileQueries };
}

function makeCaravanDs(over: Partial<PrReviewCaravanSource> = {}): PrReviewCaravanSource {
  return {
    getPrReviews: () => [],
    getPrReviewFindings: () => [],
    ...over,
  };
}

const NOW = () => new Date('2026-05-20T00:00:00.000Z');

describe('CrossSourceCorrelator', () => {
  it('exposes a tier=4 self-read analyzer subscribing wave_start', () => {
    const { ds } = makeDs();
    const c = new CrossSourceCorrelator({ trailDb: ds });
    expect(c.id).toBe('CrossSourceCorrelator');
    expect(c.tier).toBe(4);
    expect(c.inputMode).toBe('self-read');
    expect(c.subscribes).toEqual(['wave_start']);
  });

  it('skips with info log when caravanDb is not configured (existing correlations preserved)', async () => {
    const { ds, written, commitFileQueries } = makeDs();
    const c = new CrossSourceCorrelator({ trailDb: ds, now: NOW });
    const { ctx, logs } = makeCtx();

    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    // 未接続は「算出不能」であって「相関 0 件」ではない。空の洗い替え（= 既存行の DELETE）を
    // 行わないこと（設定漏れの 1 run が既存データ削除にならない）
    expect(written).toEqual([]);
    expect(commitFileQueries).toEqual([]); // activity_commit_files は読まない
    expect(logs.join('\n')).toContain('caravan-book.db not configured');
  });

  it('short-circuits to empty when there are no PR reviews (no heavy reads)', async () => {
    const { ds, written, commitFileQueries } = makeDs();
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb: makeCaravanDs(), now: NOW });
    const { ctx, logs } = makeCtx();

    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    expect(written).toEqual([[]]);
    expect(commitFileQueries).toEqual([]); // activity_commit_files は読まない
    expect(logs.join('\n')).toContain('no PR reviews');
  });

  it('computes and stores correlations when reviews exist', async () => {
    let queriedPaths: string[] = [];
    const { ds, written } = makeDs({
      getCorrelationSessionCommits: () => [
        { sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z', repoName: 'widget' },
      ],
      getDoraReleases: () => [{ tag: 'v1', releasedAt: '2026-01-20T00:00:00.000Z', repoName: 'widget' }],
      getCorrelationCommitFiles: (paths) => { queriedPaths = [...paths]; return [{ commitHash: 'h1', filePath: 'src/a.ts', repoName: 'widget' }]; },
    });
    const caravanDb = makeCaravanDs({
      getPrReviews: () => [
        { reviewId: 'r1', repoName: 'widget', prNumber: 7, author: 'a', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-15T00:00:00.000Z', bodyHash: 'h' },
      ],
      getPrReviewFindings: () => [
        { findingId: 'r1#c0', reviewId: 'r1', filePath: 'src/a.ts', lineNumber: 1, severity: null, category: null, body: 'x', createdAt: '2026-01-15T00:00:00.000Z' },
      ],
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW });
    const { ctx, logs } = makeCtx();

    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    expect(queriedPaths).toEqual(['src/a.ts']); // finding のファイルだけ問い合わせ
    expect(written).toHaveLength(1);
    expect(written[0].map((r) => r.correlationType)).toEqual([
      'pr_finding_commit',
      'pr_review_release',
      'pr_review_session',
    ]);
    expect(c.getCorrelationsComputed()).toBe(3);
    expect(logs.join('\n')).toContain('correlations=3');
  });

  it('ignores non-derived waves and unrelated events', async () => {
    const { ds, written } = makeDs();
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb: makeCaravanDs(), now: NOW });
    const { ctx } = makeCtx();
    await c.onEvent({ kind: 'wave_start', wave: 'memory' }, ctx);
    await c.onEvent({ kind: 'release_resolved', tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z' }, ctx);
    expect(written).toEqual([]);
  });

  it('logs error and does not throw when the memory data source fails', async () => {
    const { ds } = makeDs();
    const caravanDb = makeCaravanDs({ getPrReviews: () => { throw new Error('db gone'); } });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW });
    const { ctx, errors } = makeCtx();
    await expect(c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx)).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[CrossSourceCorrelator] failed: db gone');
  });

  it('falls back to undefined sinceCommittedAt when all reviews have invalid submittedAt', async () => {
    let queriedSince: string | undefined = 'SENTINEL';
    const { ds } = makeDs({
      getCorrelationSessionCommits: (since) => { queriedSince = since; return []; },
    });
    const caravanDb = makeCaravanDs({
      getPrReviews: () => [
        { reviewId: 'r1', repoName: 'w', prNumber: 1, author: 'a', state: 'APPROVED', submittedAt: 'NOT_A_DATE', bodyHash: 'h' },
      ],
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW });
    const { ctx } = makeCtx();

    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    // earliestSince は全 review の submittedAt が NaN → undefined を返す
    expect(queriedSince).toBeUndefined();
  });

  it('handles non-Error thrown value (string)', async () => {
    const { ds } = makeDs();
    const caravanDb = makeCaravanDs({ getPrReviews: () => { throw 'network-error'; } });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW });
    const { ctx, errors } = makeCtx();
    await expect(c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx)).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[CrossSourceCorrelator] failed: network-error');
  });

  it('calls getCorrelationCommitFiles with empty array when all findings have empty filePath', async () => {
    const queriedPaths: string[][] = [];
    const { ds } = makeDs({
      getCorrelationCommitFiles: (paths) => { queriedPaths.push([...paths]); return []; },
    });
    const caravanDb = makeCaravanDs({
      getPrReviews: () => [
        { reviewId: 'r1', repoName: 'w', prNumber: 1, author: 'a', state: 'APPROVED', submittedAt: '2026-01-15T00:00:00.000Z', bodyHash: 'h' },
      ],
      getPrReviewFindings: () => [
        { findingId: 'f1', reviewId: 'r1', filePath: '', lineNumber: 0, severity: null, category: null, body: 'b', createdAt: '2026-01-15T00:00:00.000Z' },
      ],
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW });
    const { ctx } = makeCtx();
    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);
    // 空 filePath は distinct でフィルタされるため [] が渡る
    expect(queriedPaths[0]).toEqual([]);
  });

  it('uses custom windowDays to compute since', async () => {
    let queriedSince: string | undefined;
    const { ds } = makeDs({
      getCorrelationSessionCommits: (since) => { queriedSince = since; return []; },
    });
    const caravanDb = makeCaravanDs({
      getPrReviews: () => [
        { reviewId: 'r1', repoName: 'w', prNumber: 1, author: 'a', state: 'APPROVED', submittedAt: '2026-01-15T00:00:00.000Z', bodyHash: 'h' },
      ],
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, caravanDb, now: NOW, windowDays: 7 });
    const { ctx } = makeCtx();
    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);
    // 2026-01-15 - 7 days = 2026-01-08
    expect(queriedSince).toBe('2026-01-08T00:00:00.000Z');
  });
});
