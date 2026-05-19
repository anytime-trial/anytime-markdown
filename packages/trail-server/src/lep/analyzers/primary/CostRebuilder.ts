import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

export interface CostRebuilderOptions {
  readonly trailDb: TrailDatabase;
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: Wave 末端で `TrailDatabase.rebuildSessionCosts()` を 1 回呼ぶ。
 *
 * 既存 importAll Phase 5 (`rebuild_costs`) と等価。
 *
 * 設計上のポイント:
 * - `session_imported` を subscribes に列挙しているが、event ごとに rebuild する**ではなく**、
 *   event 受信回数だけカウントして `onRunEnd` で 1 回まとめて rebuild する。
 *   event ごとに rebuild すると全件再集計が O(N^2) になり性能崩壊する (プラン §4.4.4 IMPORTANT)。
 */
export class CostRebuilder implements Analyzer {
  readonly id = 'CostRebuilder';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['session_imported'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private importedCount = 0;

  constructor(private readonly opts: CostRebuilderOptions) {}

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.importedCount = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'session_imported') return;
    this.importedCount += 1;
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    this.opts.onPhase?.({ phase: 'rebuild_costs', action: 'start' });
    try {
      this.opts.onProgress?.('Rebuilding session costs...', 0);
      this.opts.trailDb.rebuildSessionCostsPublic();
      this.opts.onProgress?.('Session costs rebuilt', 0);
      this.opts.onPhase?.({ phase: 'rebuild_costs', action: 'finish' });
      ctx.logger.info(`[CostRebuilder] done (imported events=${this.importedCount})`);
    } catch (err) {
      this.opts.onPhase?.({
        phase: 'rebuild_costs',
        action: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      ctx.logger.error(
        `[CostRebuilder] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
