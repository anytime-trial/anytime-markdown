import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';

/**
 * LEP 経由で AnalyzeAllRunner.runImpl() が委譲動作することを確認する統合テスト。
 *
 * Step 2d 以降は ImportAllLegacyAnalyzer は廃止され、Layer 1 Ingester + Layer 2 primary
 * analyzer + PersistAnalyzer(save) が trail.db 取込を担う。本 test は LEP wave モデル特有の
 * 不変条件 (save → memory-core 順序、wave_complete:primary barrier 等) を直接確認する。
 */

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function makeMemoryCore(dir: string, pipelineRunner: jest.Mock = jest.fn(async () => undefined)) {
  return new MemoryCoreService({
    logSink: makeLogSink(),
    trailDbPath: join(dir, 'trail.db'),
    dbPath: join(dir, 'memory-core.db'),
    statePath: join(dir, 'memory-core-runner.json'),
    pipelineRunner,
  });
}

function makeFakeTrailDb(save: jest.Mock = jest.fn()): TrailDatabase {
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
  } as unknown as TrailDatabase;
}

describe('AnalyzeAllRunner (LEP integration)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-lep-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits Persist/MemoryCoreLegacy log markers via LepOrchestrator', async () => {
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[Persist] trail.db saved');
    expect(allLines).toContain('[MemoryCoreLegacy] start');
    expect(allLines).toContain('[MemoryCoreLegacy] done');
  });

  it('memory-core fires only after trail.db save completes (wave_complete:primary barrier)', async () => {
    const order: string[] = [];
    const save = jest.fn(() => { order.push('save'); });
    const pipelineRunner = jest.fn(async () => {
      order.push('memory-core.start');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');
    expect(order).toEqual(['save', 'memory-core.start']);
  });

  it('preserves error combination when both save and memory-core throw', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const pipelineRunner = jest.fn(async () => {
      throw new Error('mem boom');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(status.lastError).toContain('importAll: save boom');
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('memory-core still runs when save throws (wave_complete:primary fires regardless)', async () => {
    const save = jest.fn(() => { throw new Error('save boom'); });
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
  });

  it('getLastImportResult aggregates analyzer counters (empty mock → all zero)', async () => {
    const memoryCore = makeMemoryCore(dir);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: memoryCore,
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

  it('reason is forwarded through LEP context to memory-core.runOnce', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runOnceSpy = jest.spyOn(memoryCore, 'runOnce');
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('import');
    expect(runOnceSpy).toHaveBeenCalledWith('import');
  });

  it('without trailDb (daemon mode): memory-core still fires via wave_complete:primary', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
  });

  it('Step 2d: full Layer 1 Ingester + Layer 2 primary analyzer pipeline runs', async () => {
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(),
      memoryCoreService: memoryCore,
      gitRoots: [],
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    // Layer 1 Ingester
    expect(allLines).toContain('[JsonlIngester]');
    expect(allLines).toContain('[GitIngester]');
    expect(allLines).toContain('[CoverageIngester]');
    expect(allLines).toContain('[MetaJsonIngester]');
    // Layer 2 primary analyzer (旧 Phase 1〜8 全て)
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
    // ImportAllLegacy は廃止済み
    expect(allLines).not.toContain('[ImportAllLegacy]');
  });

  it('Step 2d: enableIngesters=false → no trail.db import pipeline (memory-core only)', async () => {
    const save = jest.fn();
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(save),
      memoryCoreService: memoryCore,
      enableIngesters: false,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).not.toContain('[JsonlIngester]');
    expect(allLines).not.toContain('[SessionImporter]');
    expect(allLines).not.toContain('[Persist]');
    // import パイプライン無効時は save も呼ばれない (getLastImportResult は null)
    expect(save).not.toHaveBeenCalled();
    expect(runner.getLastImportResult()).toBeNull();
    // memory-core は走る
    expect(allLines).toContain('[MemoryCoreLegacy] start');
  });
});
