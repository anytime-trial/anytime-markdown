import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

export interface SubagentTypeBackfillerOptions {
  readonly trailDb: TrailDatabase;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer (inputMode='self-read'): `meta_json` を購読し、Wave 末端で
 * `TrailDatabase.backfillSubagentTypePublic()` を 1 回呼ぶ。
 *
 * 既存 importAll Phase 8 の subagent_type backfill と等価。
 * `_migrations.subagent_type_backfill_v1` フラグで一度きり実行が保証されるため冪等。
 * backfillSubagentType 自体が ~/.claude/projects を直接スキャンするため inputMode='self-read'。
 *
 * 既存挙動同様、失敗は非致命的 (throw しない)。
 */
export class SubagentTypeBackfiller implements Analyzer {
  readonly id = 'SubagentTypeBackfiller';
  readonly tier = 2 as const;
  readonly inputMode = 'self-read' as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['meta_json'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private metaCount = 0;

  constructor(private readonly opts: SubagentTypeBackfillerOptions) {}

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.metaCount = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'meta_json') return;
    this.metaCount += 1;
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    try {
      this.opts.onProgress?.('Backfilling subagent_type...', 0);
      this.opts.trailDb.backfillSubagentTypePublic();
      ctx.logger.info(`[SubagentTypeBackfiller] done (meta events=${this.metaCount})`);
    } catch (err) {
      ctx.logger.error(
        `[SubagentTypeBackfiller] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
