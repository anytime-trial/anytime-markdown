import { createAnalyzeAllJob } from '../AnalyzeAllJob';
import type { MemoryCoreService, MemoryCoreServiceStatus } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

function makeStatus(overrides: Partial<MemoryCoreServiceStatus> = {}): MemoryCoreServiceStatus {
  return {
    schemaVersion: 1,
    paused: false,
    pausedAt: null,
    pausedBy: null,
    lastRunAt: '2026-05-13T12:00:00.000Z',
    lastDurationMs: 100,
    lastReason: 'periodic',
    lastError: null,
    ticksRun: 1,
    ticksSkipped: 0,
    running: false,
    ...overrides,
  };
}

type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

function makeImportAllResult(overrides: Partial<ImportAllResult> = {}): ImportAllResult {
  return {
    imported: 0,
    skipped: 0,
    commitsResolved: 0,
    releasesResolved: 0,
    releasesAnalyzed: 0,
    coverageImported: 0,
    currentCoverageImported: 0,
    messageCommitsBackfilled: 0,
    ...overrides,
  };
}

describe('createAnalyzeAllJob', () => {
  it('trailDb 未指定: runOnce のみ実行 (旧挙動)', async () => {
    const runOnce = jest.fn(async () => makeStatus());
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createAnalyzeAllJob({
      service,
      intervalMs: 1_800_000,
      runOnStart: true,
      startupDelayMs: 5_000,
    });

    expect(job.id).toBe('analyze-all');
    expect(job.intervalMs).toBe(1_800_000);
    expect(job.runOnStart).toBe(true);
    expect(job.startupDelayMs).toBe(5_000);

    const result = await job.run();
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledWith('periodic');
    expect(result.status).toBe('ok');
    expect(result.metrics?.ticksRun).toBe(1);
    expect(result.metrics?.imported).toBeUndefined();
  });

  it('trailDb 指定: importAll → runOnce の順に実行し metrics に imported/skipped を含む', async () => {
    const importAll = jest.fn(async () => makeImportAllResult({ imported: 12, skipped: 348 }));
    const runOnce = jest.fn(async () => makeStatus({ ticksRun: 5 }));
    const trailDb = { importAll } as unknown as TrailDatabase;
    const service = { runOnce } as unknown as MemoryCoreService;
    const gitRoots = ['/repo/a', '/repo/b'];

    const callOrder: string[] = [];
    importAll.mockImplementation(async () => {
      callOrder.push('importAll');
      return makeImportAllResult({ imported: 12, skipped: 348 });
    });
    runOnce.mockImplementation(async () => {
      callOrder.push('runOnce');
      return makeStatus({ ticksRun: 5 });
    });

    const job = createAnalyzeAllJob({
      service,
      trailDb,
      gitRoots,
      intervalMs: 1_800_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const result = await job.run();

    expect(callOrder).toEqual(['importAll', 'runOnce']);
    // importAll(onProgress, gitRoots, excludePatterns, analyzeFn, onPhase) 全 5 引数で呼ばれる
    const callArgs = importAll.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBeUndefined();
    expect(callArgs[1]).toEqual(gitRoots);
    expect(runOnce).toHaveBeenCalledWith('periodic');
    expect(result.status).toBe('ok');
    expect(result.metrics?.imported).toBe(12);
    expect(result.metrics?.skipped).toBe(348);
    expect(result.metrics?.ticksRun).toBe(5);
  });

  it('importAll が throw しても runOnce は実行される + status="error" になる', async () => {
    const importAll = jest.fn(async () => {
      throw new Error('git not found');
    });
    const runOnce = jest.fn(async () => makeStatus({ ticksRun: 1 }));
    const trailDb = { importAll } as unknown as TrailDatabase;
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createAnalyzeAllJob({
      service,
      trailDb,
      gitRoots: [],
      intervalMs: 1_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const result = await job.run();

    expect(importAll).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('error');
    expect(result.message).toContain('git not found');
    expect(result.metrics?.ticksRun).toBe(1);
  });

  it('runOnce が lastError を持つ場合 status="error"', async () => {
    const runOnce = jest.fn(async () =>
      makeStatus({ lastError: 'pipeline boom', ticksRun: 0 }),
    );
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createAnalyzeAllJob({
      service,
      intervalMs: 1_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const result = await job.run();
    expect(result.status).toBe('error');
    expect(result.message).toContain('pipeline boom');
  });

  it('importAll と runOnce の両方が error: 合成メッセージ', async () => {
    const importAll = jest.fn(async () => {
      throw new Error('import-err');
    });
    const runOnce = jest.fn(async () => makeStatus({ lastError: 'pipeline-err' }));
    const trailDb = { importAll } as unknown as TrailDatabase;
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createAnalyzeAllJob({
      service,
      trailDb,
      gitRoots: [],
      intervalMs: 1_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const result = await job.run();
    expect(result.status).toBe('error');
    expect(result.message).toContain('import-err');
    expect(result.message).toContain('pipeline-err');
  });

  it('skipped-tick deltas via metrics on subsequent runs', async () => {
    let calls = 0;
    const runOnce = jest.fn(async () => {
      calls++;
      return makeStatus({ ticksSkipped: calls });
    });
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createAnalyzeAllJob({
      service,
      intervalMs: 1_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const r1 = await job.run();
    const r2 = await job.run();
    expect(r1.metrics?.ticksSkipped).toBe(1);
    expect(r2.metrics?.ticksSkipped).toBe(2);
  });
});
