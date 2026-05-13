import type { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { JobResult, ScheduledJob } from '../runtime/DaemonScheduler';

export interface MemoryCorePipelineJobOptions {
  service: MemoryCoreService;
  intervalMs: number;
  runOnStart: boolean;
  startupDelayMs: number;
}

/**
 * DaemonScheduler 経由で `MemoryCoreService.runOnce('periodic')` を周期実行する
 * ScheduledJob ラッパ。
 *
 * - mutex は service 側に存在するので、scheduler の同時実行ガードと service の
 *   mutex が二重に効く (どちらも idempotent)
 * - pause 中は service が skip するので、scheduler から見れば status='ok' で
 *   durationMs だけ短い run になる (lastError なし)
 */
export function createMemoryCorePipelineJob(opts: MemoryCorePipelineJobOptions): ScheduledJob {
  return {
    id: 'memory-core',
    intervalMs: opts.intervalMs,
    startupDelayMs: opts.startupDelayMs,
    runOnStart: opts.runOnStart,
    async run(): Promise<JobResult> {
      const startedAt = Date.now();
      const status = await opts.service.runOnce('periodic');
      const lastError = status.lastError;
      return {
        status: lastError ? 'error' : 'ok',
        durationMs: status.lastDurationMs ?? Date.now() - startedAt,
        ...(lastError ? { message: lastError } : {}),
        metrics: {
          ticksRun: status.ticksRun,
          ticksSkipped: status.ticksSkipped,
        },
      };
    },
  };
}
