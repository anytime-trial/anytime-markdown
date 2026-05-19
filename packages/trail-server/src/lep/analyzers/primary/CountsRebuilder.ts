import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

export interface CountsRebuilderOptions {
  readonly trailDb: TrailDatabase;
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: Wave 末端で `TrailDatabase.rebuildDailyCounts()` +
 * `rebuildSessionStats()` を 1 回呼ぶ。
 *
 * 既存 importAll Phase 7 (`rebuild_counts`) と等価。
 * Cost と同様、event ごとに実行すると性能崩壊するため Wave 末端 1 回に集約する
 * (プラン §4.4.4 IMPORTANT)。
 */
export class CountsRebuilder implements Analyzer {
  readonly id = 'CountsRebuilder';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  constructor(private readonly opts: CountsRebuilderOptions) {}

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    this.opts.onPhase?.({ phase: 'rebuild_counts', action: 'start' });
    try {
      this.opts.onProgress?.('Rebuilding daily counts...', 0);
      this.opts.trailDb.rebuildDailyCountsPublic();
      this.opts.onProgress?.('Daily counts rebuilt', 0);
      this.opts.onProgress?.('Rebuilding session stats...', 0);
      this.opts.trailDb.rebuildSessionStatsPublic();
      this.opts.onProgress?.('Session stats rebuilt', 0);
      this.opts.onPhase?.({ phase: 'rebuild_counts', action: 'finish' });
      ctx.logger.info('[CountsRebuilder] done');
    } catch (err) {
      this.opts.onPhase?.({
        phase: 'rebuild_counts',
        action: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      ctx.logger.error(
        `[CountsRebuilder] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
