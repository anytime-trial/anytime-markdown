import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { JobResult, ScheduledJob } from '../runtime/DaemonScheduler';

export interface PeriodicImportJobOptions {
  trailDb: TrailDatabase;
  gitRoots: readonly string[];
  intervalMs: number;
  runOnStart: boolean;
  startupDelayMs: number;
}

export function createPeriodicImportJob(opts: PeriodicImportJobOptions): ScheduledJob {
  return {
    id: 'periodic-import',
    intervalMs: opts.intervalMs,
    startupDelayMs: opts.startupDelayMs,
    runOnStart: opts.runOnStart,
    async run(): Promise<JobResult> {
      const startedAt = Date.now();
      const result = await opts.trailDb.importAll(undefined, opts.gitRoots);
      return {
        status: 'ok',
        durationMs: Date.now() - startedAt,
        metrics: {
          imported: result.imported,
          skipped: result.skipped,
          commitsResolved: result.commitsResolved,
        },
      };
    },
  };
}
