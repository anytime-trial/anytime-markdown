import { createMemoryCorePipelineJob } from '../MemoryCorePipelineJob';
import type { MemoryCoreService, MemoryCoreServiceStatus } from '@anytime-markdown/memory-core';

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

describe('createMemoryCorePipelineJob', () => {
  it('returns a job that calls service.runOnce("periodic") once', async () => {
    const runOnce = jest.fn(async () => makeStatus());
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createMemoryCorePipelineJob({
      service,
      intervalMs: 1_800_000,
      runOnStart: true,
      startupDelayMs: 5_000,
    });

    expect(job.id).toBe('memory-core');
    expect(job.intervalMs).toBe(1_800_000);
    expect(job.runOnStart).toBe(true);
    expect(job.startupDelayMs).toBe(5_000);

    const result = await job.run();
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledWith('periodic');
    expect(result.status).toBe('ok');
    expect(result.metrics?.ticksRun).toBe(1);
  });

  it('returns status="error" when service reports lastError', async () => {
    const runOnce = jest.fn(async () =>
      makeStatus({ lastError: 'pipeline boom', ticksRun: 0 }),
    );
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createMemoryCorePipelineJob({
      service,
      intervalMs: 1_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    const result = await job.run();
    expect(result.status).toBe('error');
    expect(result.message).toContain('pipeline boom');
  });

  it('reports skipped-tick deltas via metrics on subsequent runs', async () => {
    let calls = 0;
    const runOnce = jest.fn(async () => {
      calls++;
      return makeStatus({ ticksSkipped: calls });
    });
    const service = { runOnce } as unknown as MemoryCoreService;

    const job = createMemoryCorePipelineJob({
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
