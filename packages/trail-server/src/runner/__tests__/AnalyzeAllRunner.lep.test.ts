import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BetterSqlite3MemoryDb,
  ingestPrReview,
  runMigrations,
  type MemoryDbConnection,
  type PipelineStatusFile,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeMemoryCoreWithSession } from './fakeMemoryScopeSession';

/**
 * Step 5 (memory-core.db 付け替え) の PR review analyzer 群 (`PrReviewImporter` /
 * `PrReviewFindingAnalyzer` / `CrossSourceCorrelator`) が使う実 memory-core.db を
 * `runMigrations` で組み立てる (`~/.claude/rules/bugfix-workflow.md` 系の方針: fake DB でなく
 * 実 SQLite の in-memory/一時ファイルを使う)。
 */
function buildTestMemoryDb(dir: string): MemoryDbConnection {
  const db = new BetterSqlite3MemoryDb({ filePath: join(dir, 'memory-core.db') });
  runMigrations(db);
  return db;
}

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
    // Step 5: PR review (pr_reviews / pr_review_findings) は memory-core.db へ移設済み。
    // trailDb 側の pr 系メソッドは呼ばれなくなったが TrailDatabase から未削除 (別作業者管轄)
    // のため、fake にも残す必要はない。
    // Step 4d cross-source 相関 (trail.db 側) のデフォルト fake: 空データ
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

  it('stage=all runs Wave 4: CrossSourceCorrelator computes correlations (memory-core.db 経由)', async () => {
    const correlationWrites: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const memoryDb = buildTestMemoryDb(dir);
    // memory_reviews (source_kind='pr_comment') を実 ingestPrReview で 1 件シード。
    ingestPrReview(memoryDb, {
      repoName: 'widget',
      prNumber: 7,
      reviewId: 'r1',
      author: 'a',
      state: 'CHANGES_REQUESTED',
      submittedAt: '2026-01-15T00:00:00.000Z',
      bodyHash: 'h',
      findings: [],
    });
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        getCorrelationSessionCommits: () => [
          { sessionId: 's1', commitHash: 'h1', committedAt: '2026-01-10T00:00:00.000Z', repoName: 'widget' },
        ],
        getDoraReleases: () => [],
        getCorrelationCommitFiles: () => [],
        replaceCrossSourceCorrelations: (rows: unknown[]) => { correlationWrites.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      memoryDbPath: join(dir, 'memory-core.db'),
      memoryDb,
      stage: 'all',
    });

    await runner.runOnce('manual');
    memoryDb.close();

    expect(logSink.lines.join('\n')).toContain('[CrossSourceCorrelator] done');
    expect(correlationWrites).toHaveLength(1);
    expect(correlationWrites[0]).toHaveLength(1); // r1 ↔ s1 (pr_review_session)
  });

  it('stage=all: CrossSourceCorrelator skips with info log when memoryDb is not configured', async () => {
    const correlationWrites: unknown[][] = [];
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(jest.fn(), {
        replaceCrossSourceCorrelations: (rows: unknown[]) => { correlationWrites.push([...rows]); },
      }),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'all',
      // memoryDbPath / memoryDb 未指定
    });

    await runner.runOnce('manual');

    expect(logSink.lines.join('\n')).toContain('[CrossSourceCorrelator] skipped (memory-core.db not configured; existing correlations preserved)');
    // 未接続では洗い替え（= 既存行の DELETE）を行わない（設定漏れの 1 run がデータ削除にならない）
    expect(correlationWrites).toEqual([]);
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

  it('Step 5: github_pr_review → PrReviewImporter → PrReviewFindingAnalyzer → memory_reviews/memory_review_findings', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const memoryDb = buildTestMemoryDb(dir);

    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      memoryDbPath: join(dir, 'memory-core.db'),
      memoryDb,
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

    // memory_reviews / memory_review_findings に実際に書き込まれたことを実測で確認する。
    const reviewRows = memoryDb.exec(
      `SELECT source_ref, reviewer, severity_overall FROM memory_reviews WHERE source_kind='pr_comment'`,
    );
    expect(reviewRows[0]?.values).toEqual([['widget#pr7#100', 'alice', 'info']]);
    const findingRows = memoryDb.exec(
      `SELECT target_file_path, target_line_start, finding_text
         FROM memory_review_findings f JOIN memory_reviews r ON r.id = f.review_id
        WHERE r.source_kind='pr_comment'`,
    );
    expect(findingRows[0]?.values).toEqual([['a.ts', 12, 'null check']]);

    memoryDb.close();
  });

  it('Step 5: PR review pipeline is a no-op when GitHub source is unconfigured', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const memoryDb = buildTestMemoryDb(dir);
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      memoryDbPath: join(dir, 'memory-core.db'),
      memoryDb,
      gitRoots: ['/repo'],
      // githubPrReview 未指定 → ingester 登録なし
    });

    await runner.runOnce('manual');
    const reviewRows = memoryDb.exec(`SELECT COUNT(*) FROM memory_reviews WHERE source_kind='pr_comment'`);
    memoryDb.close();

    expect(logSink.lines.join('\n')).not.toContain('[GitHubPrReviewIngester]');
    expect(reviewRows[0]?.values?.[0]?.[0]).toBe(0);
  });

  it('Step 5: memoryDbPath not configured → PrReviewImporter / PrReviewFindingAnalyzer are not built (info log, no silent skip)', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      gitRoots: ['/repo'],
      githubPrReview: {
        client: makeFakeGitHubClient() as never,
        gitRemoteReader: { getRemoteUrl: () => 'https://github.com/acme/widget.git' },
      },
      // memoryDbPath / memoryDb 未指定
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[PrReview] memoryDbPath not configured — skipping PrReviewImporter / PrReviewFindingAnalyzer');
    expect(allLines).not.toContain('[PrReviewImporter] done');
    expect(allLines).not.toContain('[PrReviewFindingAnalyzer] done');
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
