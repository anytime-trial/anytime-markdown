import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

export interface BehaviorAnalyzerOptions {
  readonly trailDb: TrailDatabase;
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: `session_imported` を購読し、各セッションに対して
 * `TrailDatabase.runBehaviorAnalysis()` (内部で `ClaudeCodeBehaviorAnalyzer.analyze`)
 * を実行する。
 *
 * 既存 importAll Phase 6 (`analyze_behavior`) と等価。session 単位の処理で十分小さく、
 * Cost / Counts のような全件再集計とは異なるため event ごとに実行する。
 */
export class BehaviorAnalyzer implements Analyzer {
  readonly id = 'BehaviorAnalyzer';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['session_imported'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private analyzedCount = 0;
  private failedCount = 0;
  private startEmitted = false;

  constructor(private readonly opts: BehaviorAnalyzerOptions) {}

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.analyzedCount = 0;
    this.failedCount = 0;
    this.startEmitted = false;
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'session_imported') return;
    if (!this.startEmitted) {
      this.opts.onPhase?.({ phase: 'analyze_behavior', action: 'start' });
      this.startEmitted = true;
    }
    try {
      this.opts.trailDb.runBehaviorAnalysis(e.sessionId);
      this.analyzedCount += 1;
    } catch (err) {
      this.failedCount += 1;
      ctx.logger.error(
        `[BehaviorAnalyzer] failed for session ${e.sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    if (this.startEmitted) {
      this.opts.onPhase?.({
        phase: 'analyze_behavior',
        action: 'finish',
        count: this.analyzedCount,
      });
    } else {
      this.opts.onPhase?.({
        phase: 'analyze_behavior',
        action: 'skip',
        message: 'no new sessions',
      });
    }
    ctx.logger.info(
      `[BehaviorAnalyzer] done (analyzed=${this.analyzedCount}, failed=${this.failedCount})`,
    );
  }
}
