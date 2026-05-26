import type { Logger } from './Logger';

export interface JobResult {
  status: 'ok' | 'skipped' | 'error';
  durationMs: number;
  message?: string;
  metrics?: Record<string, number>;
}

export interface ScheduledJob {
  id: string;
  intervalMs: number;
  startupDelayMs: number;
  runOnStart: boolean;
  run(): Promise<JobResult>;
}

export class DaemonScheduler {
  private timers: NodeJS.Timeout[] = [];
  private readonly running: Set<string> = new Set();
  private stopRequested = false;
  private readonly pending: Promise<unknown>[] = [];

  constructor(
    private readonly jobs: readonly ScheduledJob[],
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.logger.info('scheduler starting', { jobCount: this.jobs.length });
    for (const job of this.jobs) {
      if (job.intervalMs === 0) {
        this.logger.info('job disabled (intervalMs=0)', { jobId: job.id });
        continue;
      }
      const launch = (): void => {
        if (this.stopRequested) return;
        if (job.runOnStart) {
          this.pending.push(this.safeRun(job));
        }
        const tick = (): void => {
          if (this.stopRequested) return;
          this.pending.push(this.safeRun(job));
        };
        const interval = setInterval(tick, job.intervalMs);
        this.timers.push(interval);
      };
      if (job.startupDelayMs > 0) {
        const t = setTimeout(launch, job.startupDelayMs);
        this.timers.push(t);
      } else {
        launch();
      }
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
    await Promise.allSettled(this.pending);
    this.logger.info('scheduler stopped');
  }

  private async safeRun(job: ScheduledJob): Promise<void> {
    if (this.running.has(job.id)) {
      this.logger.debug('job skipped (already running)', { jobId: job.id });
      return;
    }
    this.running.add(job.id);
    const childLogger = this.logger.child(`scheduler/${job.id}`);
    const startedAt = Date.now();
    try {
      childLogger.info('started');
      const result = await job.run();
      const duration = Date.now() - startedAt;
      childLogger.info('completed', { status: result.status, durationMs: duration, ...result.metrics });
    } catch (err) {
      const duration = Date.now() - startedAt;
      childLogger.error('failed', err, { durationMs: duration });
    } finally {
      this.running.delete(job.id);
    }
  }
}
