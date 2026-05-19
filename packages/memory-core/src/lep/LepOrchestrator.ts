import type { EventBus } from './EventBus';
import type { Analyzer, AnalyzerContext } from './types';
import { noopLogger, type MemoryLogger } from '../logger';
import type { RunReason } from '../runner/types';

export interface LepRunOnceOptions {
  runId: string;
  reason: RunReason;
}

export interface LepRunOnceResult {
  /** analyzer.id → 発生した Error (onRunStart / onRunEnd / onEvent いずれか) */
  readonly errors: ReadonlyMap<string, Error>;
}

/**
 * LEP の Wave 1 → 2 → 3 → 4 順次実行 orchestrator。
 *
 * Wave モデル:
 * - Wave 1 (sources):  tier=1 の analyzer を順次 onRunEnd
 * - Wave 2 (primary):  tier=2 の analyzer を順次 onRunEnd
 * - Wave 3 (memory):   tier=3 の analyzer を順次 onRunEnd
 * - Wave 4 (derived):  tier=4 の analyzer を順次 onRunEnd
 *
 * 各 Wave 終了時に `wave_complete` event を publish する。event subscriber は
 * Wave 境界をトリガに動作する (例: MemoryCoreLegacyAnalyzer は wave_complete:primary を購読)。
 *
 * エラーハンドリング: analyzer の throw は orchestrator が catch し、
 * `result.errors` に `analyzer.id` をキーに保存して run 全体は継続する。
 * 上位 orchestrator (AnalyzeAllRunner 等) が errors を読み取り、最終的な
 * 例外メッセージを組み立てる責務を持つ。
 */
export class LepOrchestrator {
  private readonly logger: MemoryLogger;

  constructor(
    private readonly bus: EventBus,
    private readonly analyzers: readonly Analyzer[],
    logger?: MemoryLogger,
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
      for (const a of [...this.analyzers].sort((x, y) => x.tier - y.tier)) {
        if (!a.onRunStart) continue;
        try {
          await a.onRunStart(ctx);
        } catch (err) {
          errors.set(a.id, toError(err));
        }
      }

      for (const [tier, wave] of WAVES) {
        for (const a of this.analyzers) {
          if (a.tier !== tier || !a.onRunEnd) continue;
          try {
            await a.onRunEnd(ctx);
          } catch (err) {
            errors.set(a.id, toError(err));
          }
        }
        await this.bus.publish({ kind: 'wave_complete', wave });
      }
    } finally {
      this.bus.endRun();
    }

    return { errors };
  }
}

type WaveName = 'sources' | 'primary' | 'memory' | 'derived';

const WAVES: ReadonlyArray<readonly [1 | 2 | 3 | 4, WaveName]> = [
  [1, 'sources'],
  [2, 'primary'],
  [3, 'memory'],
  [4, 'derived'],
];

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
