import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineStatusFile } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeMemoryCoreWithSession } from './fakeMemoryScopeSession';

/**
 * LEP 経由で AnalyzeAllRunner.runImpl() が委譲動作することを確認する統合テスト。
 *
 * Step 3d 以降: Layer 3 は 7 個の memory analyzer が `wave_start:memory` に応答して
 * `MemoryCoreService.openScopeSession()` の scope メソッドを呼ぶ。本 test は LEP wave モデルの
 * 不変条件 (save → memory 順序、Wave 2→3 barrier 等) を fake scope session で直接確認する。
 */

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function makeFakeTrailDb(save: jest.Mock = jest.fn(), extra: Partial<Record<string, unknown>> = {}): TrailDatabase {
  return {
    save,
    getImportedFileMap: () => new Map(),
    isCommitResolutionDone: () => true,
    beginExternalTransaction: () => undefined,
    commitExternalTransaction: () => undefined,
    rollbackExternalTransaction: () => undefined,
    rebuildSessionCostsPublic: () => undefined,
    rebuildDailyCountsPublic: () => undefined,
    rebuildSessionStatsPublic: () => undefined,
    runBehaviorAnalysis: () => undefined,
    analyzeReleases: () => 0,
    backfillCommitFilesPublic: () => undefined,
    backfillSubagentTypePublic: () => undefined,
    backfillMessageCommits: () => 0,
    // Layer 4 (DORA) のデフォルト fake: 空データ
    getDoraReleases: () => [],
    getDoraCommits: () => [],
    replaceDoraMetrics: () => undefined,
    // Step 4c PR review のデフォルト fake: no-op
    getPrReviewBodyHash: () => null,
    upsertPrReview: () => undefined,
    getPrReviewDetail: () => null,
    replacePrReviewFindings: () => undefined,
    // Step 4d cross-source 相関のデフォルト fake: 空データ
    getPrReviews: () => [],
    getPrReviewFindings: () => [],
    getCorrelationSessionCommits: () => [],
    getCorrelationCommitFiles: () => [],
    replaceCrossSourceCorrelations: () => undefined,
    ...extra,
  } as unknown as TrailDatabase;
}

/** github_pr_review を 1 件返す fake GitHub client。 */
function makeFakeGitHubClient(): unknown {
  return {
    listPullNumbers: async () => [{ number: 7, updatedAt: '2026-01-10T00:00:00Z' }],
    listReviews: async () => [
      { id: 100, author: 'alice', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-10T00:00:00Z', body: 'fix' },
    ],
    listReviewComments: async () => [
      { reviewId: 100, path: 'a.ts', line: 12, body: 'null check' },
    ],
  };
}

describe('AnalyzeAllRunner (LEP integration)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-lep-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits Persist + memory analyzer log markers via LepOrchestrator', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[Persist] trail.db saved');
    expect(allLines).toContain('[ConversationMemoryAnalyzer] start');
    expect(allLines).toContain('[EmbeddingBackfillAnalyzer] done');
    expect(allLines).not.toContain('[MemoryCoreLegacy]');
  });

  it('memory fires only after trail.db save completes (Wave 2 → Wave 3 barrier)', async () => {
    const order: string[] = [];
    const save = jest.fn(() => { order.push('save'); });
    const fake = makeFakeScopeSession({ order, orderLabel: 'memory' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.runOnce('manual');
    expect(order).toEqual(['save', 'memory']);
    expect(fake.closed).toBe(1);
  });

  it('preserves error combination when both save and a memory scope throw', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const fake = makeFakeScopeSession({ errorOnScope: 'runConversation', errorMessage: 'mem boom' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');
    expect(status.lastError).toContain('importAll: save boom');
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('memory still runs when save throws (Wave 3 independent of Wave 2 error)', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.runOnce('manual');
    expect(fake.calls.length).toBe(7); // 7 scope すべて実行
  });

  it('getLastImportResult aggregates analyzer counters (empty mock → all zero)', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      gitRoots: [],
    });

    expect(runner.getLastImportResult()).toBeNull();
    await runner.runOnce('manual');
    expect(runner.getLastImportResult()).toEqual({
      imported: 0,
      skipped: 0,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    });
  });

  it('without trailDb (daemon mode): memory still runs via wave_start:memory', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    await runner.runOnce('manual');
    expect(fake.calls.length).toBe(7);
  });

  it('trail.db missing → session unavailable → memory scopes skipped (no crash)', async () => {
    // openScopeSession が null を返す (実 trail.db 不在) ケース。
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, null),
    });
    const status = await runner.runOnce('manual');
    expect(status.lastError).toBeNull();
    expect(status.ticksRun).toBe(1);
  });

  it('Step 2d: full Layer 1 Ingester + Layer 2 primary analyzer pipeline runs', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      gitRoots: [],
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[JsonlIngester]');
    expect(allLines).toContain('[GitIngester]');
    expect(allLines).toContain('[CoverageIngester]');
    expect(allLines).toContain('[MetaJsonIngester]');
    expect(allLines).toContain('[SessionImporter] start');
    expect(allLines).toContain('[SessionImporter] done');
    expect(allLines).toContain('[CommitResolver] done');
    expect(allLines).toContain('[ReleaseResolver] done');
    expect(allLines).toContain('[CodeGraphBuilder] done');
    expect(allLines).toContain('[CostRebuilder] done');
    expect(allLines).toContain('[BehaviorAnalyzer] done');
    expect(allLines).toContain('[CountsRebuilder] done');
    expect(allLines).toContain('[CommitFilesBackfiller] done');
    expect(allLines).toContain('[SubagentTypeBackfiller] done');
    expect(allLines).toContain('[MessageCommitMatcher] done');
    expect(allLines).toContain('[Persist] trail.db saved');
    expect(allLines).not.toContain('[ImportAllLegacy]');
  });

  it('Step 2d: enableIngesters=false → no trail.db import pipeline (memory only)', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      enableIngesters: false,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).not.toContain('[JsonlIngester]');
    expect(allLines).not.toContain('[SessionImporter]');
    expect(allLines).not.toContain('[Persist]');
    expect(save).not.toHaveBeenCalled();
    expect(runner.getLastImportResult()).toBeNull();
    // memory は走る
    expect(fake.calls.length).toBe(7);
  });

  it('stage=primary skips Wave 3 (memory not run)', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'primary',
    });
    await runner.runOnce('manual');
    expect(fake.calls).toEqual([]); // Wave 3 が走らない
  });

  it('stage=primary writes pipeline-status.json with all memory scopes skipped', async () => {
    const fake = makeFakeScopeSession();
    const statusPath = join(dir, 'pipeline-status.json');
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'primary',
      pipelineStatusFilePath: statusPath,
    });

    await runner.runOnce('manual');

    expect(existsSync(statusPath)).toBe(true);
    const file = JSON.parse(readFileSync(statusPath, 'utf-8')) as PipelineStatusFile;
    expect(file.pipelines.length).toBeGreaterThan(0);
    expect(file.pipelines.every((p) => p.state === 'skipped')).toBe(true);
    expect(file.pipelines.map((p) => p.scope)).toContain('conversation_incremental');
    expect(file.pipelines.map((p) => p.scope)).toContain('embedding_backfill');
  });

  it('stage=primary+memory does NOT write skipped status (Wave 3 writer owns it)', async () => {
    const fake = makeFakeScopeSession();
    const statusPath = join(dir, 'pipeline-status.json');
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'primary+memory',
      pipelineStatusFilePath: statusPath,
    });

    await runner.runOnce('manual');

    // memory wave を含む stage では runner は skipped を書かない (Wave 3 側 writer に委ねる)。
    // fake session は status を書かないため、ファイルは作られない。
    expect(existsSync(statusPath)).toBe(false);
    expect(fake.calls.length).toBe(7); // memory は走る
  });

  it('stage=disabled also marks memory scopes skipped when status path given', async () => {
    const fake = makeFakeScopeSession();
    const statusPath = join(dir, 'pipeline-status.json');
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'disabled',
      pipelineStatusFilePath: statusPath,
    });

    await runner.runOnce('manual');

    const file = JSON.parse(readFileSync(statusPath, 'utf-8')) as PipelineStatusFile;
    expect(file.pipelines.every((p) => p.state === 'skipped')).toBe(true);
  });

  it('stage=memory runs only Wave 3 (memory runs, no import save)', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'memory',
    });
    await runner.runOnce('manual');
    expect(fake.calls.length).toBe(7); // memory は走る
    expect(save).not.toHaveBeenCalled(); // Wave 2 (PersistAnalyzer) は走らない
  });

  it('stage=all runs Wave 4: DoraMetricsAggregator computes dora_metrics', async () => {
    const written: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        getDoraReleases: () => [
          { tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z', repoName: 'repoA' },
        ],
        getDoraCommits: () => [
          { commitHash: 'c1', committedAt: '2026-01-09T00:00:00.000Z', repoName: 'repoA' },
        ],
        replaceDoraMetrics: (rows: unknown[]) => { written.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'all',
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).toContain('[DoraMetricsAggregator] done');
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(1); // repoA / 2026-01
  });

  it('stage=all runs Wave 4: CrossSourceCorrelator computes correlations', async () => {
    const correlationWrites: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        getPrReviews: () => [
          { reviewId: 'r1', repoName: 'widget', prNumber: 7, author: 'a', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-15T00:00:00.000Z', bodyHash: 'h' },
        ],
        getPrReviewFindings: () => [],
        getCorrelationSessionCommits: () => [
          { sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z', repoName: 'widget' },
        ],
        getDoraReleases: () => [],
        getCorrelationCommitFiles: () => [],
        replaceCrossSourceCorrelations: (rows: unknown[]) => { correlationWrites.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'all',
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).toContain('[CrossSourceCorrelator] done');
    expect(correlationWrites).toHaveLength(1);
    expect(correlationWrites[0]).toHaveLength(1); // r1 ↔ s1 (pr_review_session)
  });

  it('stage=primary+memory does NOT run Wave 4 (DoraMetricsAggregator skipped)', async () => {
    const written: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        getDoraReleases: () => [{ tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z', repoName: 'repoA' }],
        replaceDoraMetrics: (rows: unknown[]) => { written.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'primary+memory',
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).not.toContain('[DoraMetricsAggregator]');
    expect(written).toEqual([]);
  });

  it('stage=all with disabledAggregators skips DoraMetricsAggregator', async () => {
    const written: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        getDoraReleases: () => [{ tag: 'v1', releasedAt: '2026-01-10T00:00:00.000Z', repoName: 'repoA' }],
        replaceDoraMetrics: (rows: unknown[]) => { written.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'all',
      disabledAggregators: ['DoraMetricsAggregator'],
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).not.toContain('[DoraMetricsAggregator]');
    expect(written).toEqual([]);
  });

  it('Step 4c: github_pr_review → PrReviewImporter → PrReviewFindingAnalyzer pipeline', async () => {
    const reviewStore = new Map<string, { state: string; body: string; comments: { path: string; line: number | null; body: string }[]; repoName: string; prNumber: number }>();
    const findingWrites: { reviewId: string; count: number }[] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();

    const trailDb = makeFakeTrailDb(jest.fn(), {
      getPrReviewBodyHash: () => null,
      upsertPrReview: (r: { reviewId: string; state: string; body: string; comments: { path: string; line: number | null; body: string }[]; repoName: string; prNumber: number }) => {
        reviewStore.set(r.reviewId, { state: r.state, body: r.body, comments: r.comments, repoName: r.repoName, prNumber: r.prNumber });
      },
      getPrReviewDetail: (reviewId: string) => {
        const r = reviewStore.get(reviewId);
        return r ? { reviewId, repoName: r.repoName, prNumber: r.prNumber, state: r.state, body: r.body, comments: r.comments } : null;
      },
      replacePrReviewFindings: (reviewId: string, findings: unknown[]) => { findingWrites.push({ reviewId, count: findings.length }); },
    });

    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb,
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      gitRoots: ['/repo'],
      githubPrReview: {
        client: makeFakeGitHubClient() as never,
        gitRemoteReader: { getRemoteUrl: () => 'https://github.com/acme/widget.git' },
      },
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[GitHubPrReviewIngester] emitted 1 reviews');
    expect(allLines).toContain('[PrReviewImporter] done (imported=1');
    expect(allLines).toContain('[PrReviewFindingAnalyzer] done (reviews=1, findings=1)');
    expect(reviewStore.has('100')).toBe(true);
    expect(findingWrites).toEqual([{ reviewId: '100', count: 1 }]);
  });

  it('Step 4c: PR review pipeline is a no-op when GitHub source is unconfigured', async () => {
    const findingWrites: unknown[] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        upsertPrReview: () => findingWrites.push('upsert'),
        replacePrReviewFindings: () => findingWrites.push('finding'),
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      gitRoots: ['/repo'],
      // githubPrReview 未指定 → ingester 登録なし
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).not.toContain('[GitHubPrReviewIngester]');
    expect(findingWrites).toEqual([]);
  });

  it('stage=disabled runs nothing', async () => {
    const save = jest.fn();
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'disabled',
    });
    await runner.runOnce('manual');
    expect(fake.calls).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});
