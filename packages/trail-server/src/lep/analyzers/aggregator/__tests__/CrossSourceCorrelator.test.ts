import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';
import type { CrossSourceCorrelationRow } from '@anytime-markdown/trail-db';

import { CrossSourceCorrelator, type CrossSourceDataSource } from '../CrossSourceCorrelator';

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
    getPrReviews: () => [],
    getPrReviewFindings: () => [],
    getCorrelationSessionCommits: () => [],
    getDoraReleases: () => [],
    getCorrelationCommitFiles: (paths) => { commitFileQueries.push([...paths]); return []; },
    replaceCrossSourceCorrelations: (rows) => { written.push([...rows]); },
    ...over,
  };
  return { ds, written, commitFileQueries };
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

  it('short-circuits to empty when there are no PR reviews (no heavy reads)', async () => {
    const { ds, written, commitFileQueries } = makeDs();
    const c = new CrossSourceCorrelator({ trailDb: ds, now: NOW });
    const { ctx, logs } = makeCtx();

    await c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx);

    expect(written).toEqual([[]]);
    expect(commitFileQueries).toEqual([]); // commit_files は読まない
    expect(logs.join('\n')).toContain('no PR reviews');
  });

  it('computes and stores correlations when reviews exist', async () => {
    let queriedPaths: string[] = [];
    const { ds, written } = makeDs({
      getPrReviews: () => [
        { reviewId: 'r1', repoName: 'widget', prNumber: 7, author: 'a', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-15T00:00:00.000Z', bodyHash: 'h' },
      ],
      getPrReviewFindings: () => [
        { findingId: 'r1#c0', reviewId: 'r1', filePath: 'src/a.ts', lineNumber: 1, severity: null, category: null, body: 'x', createdAt: '2026-01-15T00:00:00.000Z' },
      ],
      getCorrelationSessionCommits: () => [
        { sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z', repoName: 'widget' },
      ],
      getDoraReleases: () => [{ tag: 'v1', releasedAt: '2026-01-20T00:00:00.000Z', repoName: 'widget' }],
      getCorrelationCommitFiles: (paths) => { queriedPaths = [...paths]; return [{ commitHash: 'h1', filePath: 'src/a.ts', repoName: 'widget' }]; },
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, now: NOW });
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
    const c = new CrossSourceCorrelator({ trailDb: ds, now: NOW });
    const { ctx } = makeCtx();
    await c.onEvent({ kind: 'wave_start', wave: 'memory' }, ctx);
    await c.onEvent({ kind: 'release_resolved', tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z' }, ctx);
    expect(written).toEqual([]);
  });

  it('logs error and does not throw when the data source fails', async () => {
    const { ds } = makeDs({
      getPrReviews: () => { throw new Error('db gone'); },
    });
    const c = new CrossSourceCorrelator({ trailDb: ds, now: NOW });
    const { ctx, errors } = makeCtx();
    await expect(c.onEvent({ kind: 'wave_start', wave: 'derived' }, ctx)).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('[CrossSourceCorrelator] failed: db gone');
  });
});
