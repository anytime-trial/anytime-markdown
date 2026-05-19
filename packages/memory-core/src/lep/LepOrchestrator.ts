import type { EventBus } from './EventBus';
import type { Analyzer, AnalyzerContext, AnalyzerEvent } from './types';
import type { RunReason } from '../runner/types';

export interface LepOrchestratorLogger {
  info(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export interface LepRunOnceOptions {
  runId: string;
  reason: RunReason;
}

export interface LepRunOnceResult {
  /** analyzer.id → 発生した Error (onRunStart / onRunEnd / onEvent いずれか) */
  readonly errors: ReadonlyMap<string, Error>;
}

const noopLogger: LepOrchestratorLogger = {
  info: () => undefined,
  error: () => undefined,
};

/**
 * LEP の Wave 1 → 2 → 3 → 4 順次実行 orchestrator (Step 1 最小実装)。
 *
 * Wave モデル (本 Step):
 * - Wave 1 (sources):  Step 1 では analyzer 未登録 (即 wave_complete を発火)
 * - Wave 2 (primary):  tier=2 の analyzer を順次 onRunEnd
 * - Wave 3 (memory):   tier=3 の analyzer を順次 onRunEnd
 * - Wave 4 (derived):  Step 1 では analyzer 未登録 (即 wave_complete を発火)
 *
 * 各 Wave 終了時に `wave_complete` event を publish する。event subscriber は
 * Wave 境界をトリガに動作する (例: MemoryCoreLegacyAnalyzer は wave_complete:primary を購読)。
 *
 * エラーハンドリング: analyzer の throw は orchestrator が catch し、
 * `result.errors` に `analyzer.id` をキーに保存して run 全体は継続する。
 * AnalyzeAllRunner などの上位 orchestrator が errors を読み取り、最終的な
 * 例外メッセージを組み立てる責務を持つ (importError / memError 合算ロジック等)。
 */
export class LepOrchestrator {
  private readonly logger: LepOrchestratorLogger;

  constructor(
    private readonly bus: EventBus,
    private readonly analyzers: readonly Analyzer[],
    logger?: LepOrchestratorLogger,
  ) {
    this.logger = logger ?? noopLogger;
  }

  async runOnce(opts: LepRunOnceOptions): Promise<LepRunOnceResult> {
    const errors = new Map<string, Error>();
    const ctx: AnalyzerContext = {
      runId: opts.runId,
      reason: opts.reason,
      logger: this.logger,
      bus: this.bus,
    };

    this.bus.beginRun(ctx, errors);

    try {
      // onRunStart (全 analyzer に対し tier 順で 1 回ずつ)
      for (const a of this.sortedAnalyzers()) {
        if (!a.onRunStart) continue;
        try {
          await a.onRunStart(ctx);
        } catch (err) {
          errors.set(`${a.id}.onRunStart`, this.toError(err));
        }
      }

      // Wave 1: sources (Step 1 では analyzer 不在)
      await this.runWave(1, ctx, errors);
      await this.publishWaveComplete('sources');

      // Wave 2: primary
      await this.runWave(2, ctx, errors);
      await this.publishWaveComplete('primary');

      // Wave 3: memory
      await this.runWave(3, ctx, errors);
      await this.publishWaveComplete('memory');

      // Wave 4: derived (Step 1 では analyzer 不在)
      await this.runWave(4, ctx, errors);
      await this.publishWaveComplete('derived');

      // onRunEnd (Step 1 では Wave 内 onRunEnd と等価 — analyzer は Wave loop 内で
      // 実行済みのため重複は避ける。ライフサイクル汎用 hook は Step 2 以降で再検討)
    } finally {
      this.bus.endRun();
    }

    return { errors };
  }

  private async runWave(
    tier: 1 | 2 | 3 | 4,
    ctx: AnalyzerContext,
    errors: Map<string, Error>,
  ): Promise<void> {
    for (const a of this.analyzers.filter((x) => x.tier === tier)) {
      if (!a.onRunEnd) continue;
      try {
        await a.onRunEnd(ctx);
      } catch (err) {
        errors.set(a.id, this.toError(err));
      }
    }
  }

  private async publishWaveComplete(wave: 'sources' | 'primary' | 'memory' | 'derived'): Promise<void> {
    const e: AnalyzerEvent = { kind: 'wave_complete', wave };
    await this.bus.publish(e);
  }

  private sortedAnalyzers(): readonly Analyzer[] {
    return [...this.analyzers].sort((a, b) => a.tier - b.tier);
  }

  private toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
  }
}
