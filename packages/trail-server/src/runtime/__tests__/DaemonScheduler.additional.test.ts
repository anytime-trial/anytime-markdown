/**
 * Additional coverage for DaemonScheduler.ts:
 * - startupDelayMs > 0 (lines 49-50) — setTimeout launch path
 * - setInterval tick fires after interval elapses (lines 42-43)
 * - job skip when already running (line 70-71)
 * - tick does not run after stop() (line 42)
 */
import { DaemonScheduler, type ScheduledJob, type JobResult } from '../DaemonScheduler';
import type { Logger } from '../Logger';

function makeMockLogger(): jest.Mocked<Logger> {
  const mock: jest.Mocked<Logger> = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    child: jest.fn(),
  };
  mock.child.mockReturnValue(mock);
  return mock;
}

describe('DaemonScheduler — additional coverage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('startupDelayMs > 0 delays the first run', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'delayed', intervalMs: 60_000, startupDelayMs: 500, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();

    // 手前では発火しない
    jest.advanceTimersByTime(499);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();

    // startupDelay を超えると launch() が呼ばれる
    jest.advanceTimersByTime(1);
    // launch 内の safeRun は Promise なので microtask を流す
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    await s.stop();
  });

  it('setInterval fires job on each tick after launch', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'periodic', intervalMs: 1_000, startupDelayMs: 0, runOnStart: false, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();

    // tick 1
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    // tick 2
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);

    await s.stop();
  });

  it('tick does not execute after stop() is called', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'tick-after-stop', intervalMs: 1_000, startupDelayMs: 0, runOnStart: false, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    // stop before any tick
    await s.stop();

    // advance timer — tick must not fire because stopRequested=true
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
  });

  it('skips job when it is already running (concurrent guard)', async () => {
    const logger = makeMockLogger();
    let resolveFirst!: () => void;
    const run = jest.fn((): Promise<JobResult> => {
      return new Promise<JobResult>((resolve) => {
        resolveFirst = () => resolve({ status: 'ok', durationMs: 1 });
      });
    });
    const job: ScheduledJob = {
      id: 'concurrent', intervalMs: 500, startupDelayMs: 0, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], logger);
    s.start();
    // first run started (runOnStart=true), but not yet finished
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    // advance timer to trigger the interval tick while first is still running
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    // second call should be skipped → debug logged
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'job skipped (already running)',
      expect.objectContaining({ jobId: 'concurrent' }),
    );

    // resolve first run and stop
    resolveFirst();
    await s.stop();
  });

  it('launch is suppressed if stopRequested before startupDelay fires', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'suppress-delayed', intervalMs: 60_000, startupDelayMs: 1_000, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    // stop before delay fires — clears the setTimeout timer
    await s.stop();

    // advance past delay
    jest.advanceTimersByTime(2_000);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
  });
});
