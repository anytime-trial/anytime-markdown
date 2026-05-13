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

describe('DaemonScheduler', () => {
  it('runs job on start when runOnStart=true and startupDelay=0', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'test', intervalMs: 60_000, startupDelayMs: 0, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    // Allow the synchronous launch to schedule the run, then wait microtasks
    await new Promise((r) => setImmediate(r));
    await s.stop();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not run on start when runOnStart=false', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'test', intervalMs: 60_000, startupDelayMs: 0, runOnStart: false, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    await new Promise((r) => setImmediate(r));
    await s.stop();
    expect(run).not.toHaveBeenCalled();
  });

  it('skips job when intervalMs=0', async () => {
    const run = jest.fn(async (): Promise<JobResult> => ({ status: 'ok', durationMs: 1 }));
    const job: ScheduledJob = {
      id: 'test', intervalMs: 0, startupDelayMs: 0, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    await new Promise((r) => setImmediate(r));
    await s.stop();
    expect(run).not.toHaveBeenCalled();
  });

  it('catches job errors and logs them', async () => {
    const logger = makeMockLogger();
    const run = jest.fn(async () => { throw new Error('boom'); });
    const job: ScheduledJob = {
      id: 'failing', intervalMs: 60_000, startupDelayMs: 0, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], logger);
    s.start();
    await new Promise((r) => setImmediate(r));
    await s.stop();
    expect(logger.error).toHaveBeenCalled();
  });

  it('stop() awaits in-flight jobs', async () => {
    let finished = false;
    const run = jest.fn(async (): Promise<JobResult> => {
      await new Promise((r) => setTimeout(r, 30));
      finished = true;
      return { status: 'ok', durationMs: 30 };
    });
    const job: ScheduledJob = {
      id: 'job', intervalMs: 60_000, startupDelayMs: 0, runOnStart: true, run,
    };
    const s = new DaemonScheduler([job], makeMockLogger());
    s.start();
    await new Promise((r) => setImmediate(r));
    await s.stop();
    expect(finished).toBe(true);
  });
});
