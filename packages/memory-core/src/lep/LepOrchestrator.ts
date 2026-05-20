import type { EventBus } from './EventBus';
import type { Analyzer, AnalyzerContext, LepStage } from './types';
import { noopLogger, type MemoryLogger } from '../logger';
import type { RunReason } from '../runner/types';

export interface LepRunOnceOptions {
  runId: string;
  reason: RunReason;
  /**
   * 実行する Wave 範囲を決める stage (設計書 9 章)。省略時 `'all'` (全 Wave、後方互換)。
   * stage に含まれない Wave は wave_start / wave_complete を出さず完全に skip する。
   */
  stage?: LepStage;
}

export interface LepRunOnceResult {
  /** analyzer.id → 発生した Error (onRunStart / onRunEnd / onEvent いずれか) */
  readonly errors: ReadonlyMap<string, Error>;
}

/**
 * LEP の Wave 1 → 2 → 3 → 4 順次実行 orchestrator。
 *
 * Wave モデル (Step 3d 以降):
 * - 各 Wave 開始時に `wave_start:<wave>` を publish (Layer 3 memory analyzer の発火契機)
 * - tier=N の `onRunStart` → `onRunEnd` を順次実行
 * - drain → `wave_complete:<wave>` を publish → drain
 *
 * stage により実行 Wave 範囲を絞る (設計書 9 章):
 * - `disabled`: なし / `sources`: W1 / `primary`: W1+2 / `memory`: W3 のみ /
 *   `primary+memory`: W1+2+3 / `all`: W1+2+3+4。
 * stage=`memory` は Wave 1/2 を skip するため `wave_complete:primary` が出ない。
 * Layer 3 analyzer は `wave_start:memory` を購読することで stage に依存せず発火する。
 *
 * `bus.drain()` は in-flight な publish と subscriber 連鎖を全て完了させる barrier。
 * 各 Wave 境界で drain を挟むことで、当該 Wave のイベント伝播が完了してから次 Wave に進む。
 * これにより Wave 2 の `PersistAnalyzer.onRunEnd` (trail.db save) が完了してから
 * Wave 3 の memory analyzer が trail.db を read-only attach する順序が保証される。
 *
 * エラーハンドリング: analyzer の throw は orchestrator が catch し、`result.errors` に
 * `analyzer.id` をキーに保存して run 全体は継続する。上位 (AnalyzeAllRunner 等) が errors を
 * 読み取り、最終的な例外メッセージを組み立てる。
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

    const stage = opts.stage ?? 'all';
    const tiersToRun = STAGE_TIERS[stage];

    this.bus.beginRun(ctx, errors);

    try {
      // Pass 1: 初期化 — 実行対象の全 tier の analyzer の `onRunStart` を Wave ループ
      // **より前**に一括実行する。これにより tier-1 ingester が Wave で event を emit する前に
      // tier-2 以降の consumer (SessionImporter 等、onRunStart で内部状態を初期化する) の
      // 初期化が完了する。`onRunStart` (初期化) と `onRunEnd` (Wave 実行 = ingester の emit /
      // consumer の commit) を分離することで、tier またぎの event 配信で consumer が
      // 未初期化のまま onEvent を受けて取りこぼす事故を防ぐ。
      for (const [tier] of WAVES) {
        if (!tiersToRun.has(tier)) continue;
        for (const a of this.analyzers) {
          if (a.tier !== tier || !a.onRunStart) continue;
          try {
            await a.onRunStart(ctx);
          } catch (err) {
            errors.set(a.id, toError(err));
          }
        }
      }

      // Pass 2: Wave 実行ループ。各 Wave で `wave_start` → 当該 tier の `onRunEnd` → `wave_complete`。
      // ingester は `onRunEnd` で source event を emit し、その消費 (tier-2 以降の onEvent) は
      // Pass 1 で初期化済みのため正しく処理される。
      for (const [tier, wave] of WAVES) {
        if (!tiersToRun.has(tier)) continue; // stage 範囲外の Wave は完全 skip

        // Wave 開始イベント (Layer 3 memory analyzer の発火契機)。stage=memory の
        // 単独実行でも wave_start:memory は emit されるため Layer 3 が走る。
        await this.bus.publish({ kind: 'wave_start', wave });
        await this.bus.drain();

        for (const a of this.analyzers) {
          if (a.tier !== tier || !a.onRunEnd) continue;
          try {
            await a.onRunEnd(ctx);
          } catch (err) {
            errors.set(a.id, toError(err));
          }
        }
        // analyzer が emit した event の伝播完了を待ち、Wave barrier を出す
        await this.bus.drain();
        await this.bus.publish({ kind: 'wave_complete', wave });
        await this.bus.drain();
      }
    } finally {
      this.bus.endRun();
    }

    return { errors };
  }
}

type WaveName = 'sources' | 'primary' | 'memory' | 'derived';
type Tier = 1 | 2 | 3 | 4;

const WAVES: ReadonlyArray<readonly [Tier, WaveName]> = [
  [1, 'sources'],
  [2, 'primary'],
  [3, 'memory'],
  [4, 'derived'],
];

/** stage → 実行する tier 集合 (設計書 9 章の stage × Wave マトリクス)。 */
const STAGE_TIERS: Record<LepStage, ReadonlySet<Tier>> = {
  disabled: new Set(),
  sources: new Set([1]),
  primary: new Set([1, 2]),
  memory: new Set([3]),
  'primary+memory': new Set([1, 2, 3]),
  all: new Set([1, 2, 3, 4]),
};

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
