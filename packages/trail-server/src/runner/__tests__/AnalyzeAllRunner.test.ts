import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

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

function makeFakeTrailDb(importAll: jest.Mock): TrailDatabase {
  // Step 2b: LEP analyzer (SessionImporter / CommitResolver) が呼ぶ helper を mock として
  // 提供する。空マップ + isCommitResolutionDone=true で skip させて副作用ゼロにする。
  return {
    importAll,
    getImportedFileMap: () => new Map(),
    isCommitResolutionDone: () => true,
    beginExternalTransaction: () => undefined,
    commitExternalTransaction: () => undefined,
    rollbackExternalTransaction: () => undefined,
  } as unknown as TrailDatabase;
}

describe('AnalyzeAllRunner', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-runner-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runOnce calls importAll then memory-core pipeline in order', async () => {
    const order: string[] = [];
    const importAll = jest.fn(async () => {
      order.push('importAll');
      return {
        imported: 0,
        skipped: 0,
        commitsResolved: 0,
        releasesResolved: 0,
        releasesAnalyzed: 0,
        coverageImported: 0,
        currentCoverageImported: 0,
        messageCommitsBackfilled: 0,
      };
    });
    const pipelineRunner = jest.fn(async () => {
      order.push('memory-core');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(order).toEqual(['importAll', 'memory-core']);
    expect(importAll).toHaveBeenCalledTimes(1);
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
    expect(status.lastReason).toBe('manual');
  });

  it('runOnce without trailDb runs only memory-core', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
    expect(status.ticksRun).toBe(1);
  });

  it('pause skips automatic reasons (startup/periodic) and increments ticksSkipped', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    await runner.pause('cli');
    const s1 = await runner.runOnce('startup');
    expect(s1.ticksSkipped).toBe(1);
    expect(importAll).not.toHaveBeenCalled();
    expect(pipelineRunner).not.toHaveBeenCalled();

    await runner.runOnce('periodic');
    expect(runner.getStatus().ticksSkipped).toBe(2);
    expect(importAll).not.toHaveBeenCalled();
  });

  it('pause does NOT skip user-initiated reasons (manual/import)', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    await runner.pause('cli');
    await runner.runOnce('manual');
    expect(importAll).toHaveBeenCalledTimes(1);
    expect(pipelineRunner).toHaveBeenCalledTimes(1);

    await runner.runOnce('import');
    expect(importAll).toHaveBeenCalledTimes(2);
    expect(pipelineRunner).toHaveBeenCalledTimes(2);
    expect(runner.getStatus().ticksRun).toBe(2);
  });

  it('records lastError when importAll throws (memory-core still runs)', async () => {
    const importAll = jest.fn(async () => {
      throw new Error('import boom');
    });
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(pipelineRunner).toHaveBeenCalledTimes(1); // memory-core も走る
    expect(status.lastError).toContain('import boom');
    expect(status.ticksRun).toBe(0); // 失敗時はカウントしない
  });

  it('records lastError when memory-core throws (importAll still ran)', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const pipelineRunner = jest.fn(async () => {
      throw new Error('mem boom');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(importAll).toHaveBeenCalledTimes(1);
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('records combined lastError when both fail', async () => {
    const importAll = jest.fn(async () => {
      throw new Error('import boom');
    });
    const pipelineRunner = jest.fn(async () => {
      throw new Error('mem boom');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    const status = await runner.runOnce('manual');
    expect(status.lastError).toContain('importAll: import boom');
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('persists state across instantiation', async () => {
    const statePath = join(dir, 'analyze-all-runner.json');
    const memoryCore = makeMemoryCore(dir);
    const r1 = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath,
      memoryCoreService: memoryCore,
    });
    await r1.pause('cli');
    await r1.runOnce('manual');
    await r1.dispose();

    const r2 = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath,
      memoryCoreService: memoryCore,
    });
    const s = r2.getStatus();
    expect(s.paused).toBe(true);
    expect(s.pausedBy).toBe('cli');
    expect(s.ticksRun).toBe(1);
    await r2.dispose();
  });

  it('start schedules startup tick with runOnStart=true', async () => {
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });

    runner.start(60_000, { runOnStart: true, startupDelayMs: 10 });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
    await runner.dispose();
  });

  it('onImportProgress / onImportPhase / onAfterRun callbacks fire', async () => {
    const progressMsgs: string[] = [];
    const phaseEvents: string[] = [];
    let afterRunCalled = 0;
    const importAll = jest.fn(
      async (
        onProgress: ((m: string) => void) | undefined,
        _gitRoots: readonly string[] | undefined,
        _excl: readonly string[] | undefined,
        _analyzeFn: unknown,
        onPhase: ((e: unknown) => void) | undefined,
      ) => {
        onProgress?.('msg1');
        onPhase?.({ phase: 'session-import', action: 'start' } as never);
        return {} as never;
      },
    );
    const memoryCore = makeMemoryCore(dir);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
      onImportProgress: (m) => progressMsgs.push(m),
      onImportPhase: (e) => phaseEvents.push(e.phase),
      onAfterRun: () => {
        afterRunCalled++;
      },
    });

    await runner.runOnce('manual');
    expect(progressMsgs).toEqual(['msg1']);
    // Step 2b 以降は SessionImporter / ReleaseResolver / CoverageImporter も onImportPhase 経由で
    // phase event を発火するため、'session-import' (importAll mock 由来) と共に格納される。
    expect(phaseEvents).toContain('session-import');
    expect(phaseEvents).toContain('import_sessions');
    expect(phaseEvents).toContain('resolve_releases');
    expect(phaseEvents).toContain('import_coverage');
    expect(afterRunCalled).toBe(1);
  });

  it('runs without memoryCoreService (useExternalDaemon mode)', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      // memoryCoreService omitted
    });
    const status = await runner.runOnce('manual');
    expect(importAll).toHaveBeenCalledTimes(1);
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
  });

  it('memory-core internal pause is independent (not user-facing post-refactor)', async () => {
    // Defensive test: AnalyzeAllRunner does not query memory-core.paused.
    // If memory-core were paused, AnalyzeAllRunner would still call runOnce
    // which would internally skip on memory-core side. This documents the
    // behavioral isolation.
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    await memoryCore.pause('internal-test');
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      memoryCoreService: memoryCore,
    });
    // AnalyzeAllRunner is NOT paused (it has its own state file)
    expect(runner.getStatus().paused).toBe(false);
    // runOnce executes; memory-core skips internally because reason='periodic' is automatic
    const status = await runner.runOnce('periodic');
    expect(pipelineRunner).not.toHaveBeenCalled(); // memory-core skipped
    expect(status.ticksRun).toBe(1); // analyze-all itself succeeded (no error)
    expect(status.lastError).toBeNull();
  });
});
