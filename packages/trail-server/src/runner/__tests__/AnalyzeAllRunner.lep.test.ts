import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';

/**
 * LEP 経由で AnalyzeAllRunner.runImpl() が委譲動作することを確認する統合テスト。
 *
 * 既存 AnalyzeAllRunner.test.ts と挙動が一致することは AnalyzeAllRunner.test.ts 自体が
 * 保証している。本 test は LEP wave モデル特有の不変条件 (importAll → wave_complete:primary →
 * memory-core 順序の解離が起きないこと等) を直接確認する。
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

function makeFakeTrailDb(importAll: jest.Mock, overrides: Partial<TrailDatabase> = {}): TrailDatabase {
  return {
    importAll,
    getImportedFileMap: () => new Map(),
    isCommitResolutionDone: () => true,
    beginExternalTransaction: () => undefined,
    commitExternalTransaction: () => undefined,
    rollbackExternalTransaction: () => undefined,
    ...overrides,
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

  it('emits ImportAllLegacy/MemoryCoreLegacy log markers via LepOrchestrator', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const pipelineRunner = jest.fn(async () => undefined);
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[ImportAllLegacy] start');
    expect(allLines).toContain('[ImportAllLegacy] done');
    expect(allLines).toContain('[MemoryCoreLegacy] start');
    expect(allLines).toContain('[MemoryCoreLegacy] done');
  });

  it('memory-core fires only after importAll completes (wave_complete:primary barrier)', async () => {
    const order: string[] = [];
    const importAll = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('importAll.done');
      return {} as never;
    });
    const pipelineRunner = jest.fn(async () => {
      order.push('memory-core.start');
    });
    const memoryCore = makeMemoryCore(dir, pipelineRunner);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    await runner.runOnce('manual');
    expect(order).toEqual(['importAll.done', 'memory-core.start']);
  });

  it('preserves error combination when both importAll and memory-core throw', async () => {
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
    // 合算メッセージは "importAll: ...; memory-core: ..." 形式
    expect(status.lastError).toContain('importAll: import boom');
    expect(status.lastError).toContain('memory-core: mem boom');
    expect(status.ticksRun).toBe(0);
  });

  it('memory-core still runs when importAll throws (wave_complete:primary fires regardless)', async () => {
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

    await runner.runOnce('manual');
    expect(pipelineRunner).toHaveBeenCalledTimes(1);
  });

  it('getLastImportResult returns ImportAllLegacyAnalyzer.lastResult', async () => {
    const result = {
      imported: 5,
      skipped: 2,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    };
    const importAll = jest.fn(async () => result);
    const memoryCore = makeMemoryCore(dir);
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
    });

    expect(runner.getLastImportResult()).toBeNull();
    await runner.runOnce('manual');
    expect(runner.getLastImportResult()).toEqual(result);
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

  it('Step 2a: Layer 1 Ingester (Jsonl/Git/Coverage/MetaJson) logs when enabled', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
      gitRoots: [],
      enableIngesters: true,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[JsonlIngester]');
    expect(allLines).toContain('[GitIngester]');
    expect(allLines).toContain('[CoverageIngester]');
    expect(allLines).toContain('[MetaJsonIngester]');
    // 既存挙動: ImportAllLegacy / MemoryCoreLegacy も実行されている (Ingester は emit のみ、不変)
    expect(allLines).toContain('[ImportAllLegacy] start');
    expect(allLines).toContain('[ImportAllLegacy] done');
  });

  it('Step 2a: Layer 1 Ingester is opt-out via enableIngesters=false', async () => {
    const importAll = jest.fn(async () => ({}) as never);
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
      enableIngesters: false,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).not.toContain('[JsonlIngester]');
    expect(allLines).not.toContain('[GitIngester]');
    expect(allLines).not.toContain('[CoverageIngester]');
    expect(allLines).not.toContain('[MetaJsonIngester]');
    // 既存 Legacy パスは動く
    expect(allLines).toContain('[ImportAllLegacy] start');
  });

  it('Step 2b: 4 primary analyzers fire when enableIngesters=true (default)', async () => {
    const importAllCalls: unknown[] = [];
    const importAll = jest.fn(async (
      _onProgress: unknown,
      _gitRoots: unknown,
      _excl: unknown,
      _analyzeFn: unknown,
      _onPhase: unknown,
      lepOpts: unknown,
    ) => {
      importAllCalls.push(lepOpts);
      return {} as never;
    });
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
      gitRoots: [],
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).toContain('[SessionImporter] start');
    expect(allLines).toContain('[SessionImporter] done');
    expect(allLines).toContain('[CommitResolver] done');
    expect(allLines).toContain('[ReleaseResolver] done');
    expect(allLines).toContain('[CoverageImporter] done');

    // ImportAllLegacy 経由で importAll に phasesToSkip が渡されている
    expect(importAllCalls).toHaveLength(1);
    const lepOpts = importAllCalls[0] as {
      phasesToSkip?: Set<string>;
      externalSessionsToAnalyze?: Set<string>;
      externalCounters?: Record<string, number>;
    };
    expect(lepOpts.phasesToSkip).toBeDefined();
    expect([...(lepOpts.phasesToSkip ?? [])].sort()).toEqual([
      'import_coverage',
      'import_sessions',
      'resolve_releases',
    ]);
    expect(lepOpts.externalSessionsToAnalyze).toBeDefined();
    expect(lepOpts.externalCounters).toMatchObject({
      imported: 0,
      skipped: 0,
      commitsResolved: 0,
      releasesResolved: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
    });
  });

  it('Step 2b: enableIngesters=false → no primary LEP analyzer, importAll runs full pipeline', async () => {
    const importAllCalls: unknown[] = [];
    const importAll = jest.fn(async (
      _onProgress: unknown,
      _gitRoots: unknown,
      _excl: unknown,
      _analyzeFn: unknown,
      _onPhase: unknown,
      lepOpts: unknown,
    ) => {
      importAllCalls.push(lepOpts);
      return {} as never;
    });
    const memoryCore = makeMemoryCore(dir);
    const logSink = makeLogSink();
    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'analyze-all-runner.json'),
      trailDb: makeFakeTrailDb(importAll),
      memoryCoreService: memoryCore,
      enableIngesters: false,
    });

    await runner.runOnce('manual');

    const allLines = logSink.lines.join('\n');
    expect(allLines).not.toContain('[SessionImporter]');
    expect(allLines).not.toContain('[CommitResolver]');
    // ImportAllLegacy は LEP analyzer なしで呼ばれるため phasesToSkip は empty Set
    const lepOpts = importAllCalls[0] as { phasesToSkip?: Set<string> };
    expect(lepOpts.phasesToSkip).toBeDefined();
    expect([...(lepOpts.phasesToSkip ?? [])]).toEqual([]);
  });
});
