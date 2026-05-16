import type { MemoryCoreService } from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { JobResult, ScheduledJob } from '../runtime/DaemonScheduler';

export interface AnalyzeAllJobOptions {
  service: MemoryCoreService;
  intervalMs: number;
  runOnStart: boolean;
  startupDelayMs: number;
  /**
   * 指定時、runOnce('periodic') の前に `trailDb.importAll(undefined, gitRoots)` を
   * 実行する (user-triggered analyzeAll コマンドと同じ "importAll → runOnce" の
   * 順序を、デーモンの periodic 経路でも踏襲するため)。
   *
   * 未指定 (undefined) の場合、importAll はスキップし runOnce のみ走る
   * (旧 createMemoryCorePipelineJob 互換挙動)。
   */
  trailDb?: TrailDatabase;
  /** trailDb と組で必須。importAll の gitRoots 引数に渡す。 */
  gitRoots?: readonly string[];
}

/**
 * DaemonScheduler 経由で「importAll → runOnce('periodic')」を周期実行する
 * ScheduledJob ラッパ。VS Code 拡張の `anytime-trail.analyzeAll` コマンド
 * (UI ボタン) と同じデータフロー (importAll → memory-core runOnce) を
 * デーモン側で再現する。
 *
 * - trailDb が指定された場合: 先に `trailDb.importAll(...)` を実行し、続いて
 *   `service.runOnce('periodic')` を実行する。
 * - trailDb 未指定の場合: runOnce のみ実行 (旧 createMemoryCorePipelineJob
 *   互換挙動。importAll を別 ScheduledJob で回す構成にも対応)。
 * - mutex は service 側に存在するので、scheduler の同時実行ガードと service の
 *   mutex が二重に効く (どちらも idempotent)
 * - pause 中は service が skip するので、scheduler から見れば status='ok' で
 *   durationMs だけ短い run になる (lastError なし)
 */
export function createAnalyzeAllJob(opts: AnalyzeAllJobOptions): ScheduledJob {
  return {
    id: 'analyze-all',
    intervalMs: opts.intervalMs,
    startupDelayMs: opts.startupDelayMs,
    runOnStart: opts.runOnStart,
    async run(): Promise<JobResult> {
      const startedAt = Date.now();

      // Phase 1: importAll (trailDb 指定時のみ)
      let imported: number | undefined;
      let skipped: number | undefined;
      let importError: string | undefined;
      if (opts.trailDb) {
        try {
          const result = await opts.trailDb.importAll(undefined, opts.gitRoots ?? []);
          imported = result.imported;
          skipped = result.skipped;
        } catch (err) {
          importError = err instanceof Error ? err.message : String(err);
        }
      }

      // Phase 2: runOnce('periodic')
      const status = await opts.service.runOnce('periodic');
      const lastError = status.lastError;

      // ジョブステータス決定: importAll error がある場合は error、なければ runOnce 結果
      const jobStatus: 'ok' | 'error' = importError || lastError ? 'error' : 'ok';
      const message = importError && lastError
        ? `import: ${importError}; pipeline: ${lastError}`
        : importError ?? lastError ?? undefined;

      return {
        status: jobStatus,
        durationMs: Date.now() - startedAt,
        ...(message ? { message } : {}),
        metrics: {
          ticksRun: status.ticksRun,
          ticksSkipped: status.ticksSkipped,
          ...(imported !== undefined ? { imported } : {}),
          ...(skipped !== undefined ? { skipped } : {}),
        },
      };
    },
  };
}
