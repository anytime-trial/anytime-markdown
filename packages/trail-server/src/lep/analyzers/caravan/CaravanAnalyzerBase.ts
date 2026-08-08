import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
  CaravanDbSession,
  ScopeResult,
} from '@anytime-markdown/trail-caravan-book';

import { evaluateLlmRequirement, ollamaUnavailableHint } from '../../LlmAvailability';
import type { CaravanWaveSessionProvider } from './CaravanWaveSessionProvider';

/**
 * Layer 3 (memory) analyzer の共通基底。
 *
 * 各 analyzer は trail-caravan-book の特定 scope を 1 つ担当する薄いラッパで、共有
 * {@link CaravanWaveSessionProvider} からセッションを取得して scope メソッドを呼ぶ。
 * cursor 管理 (`caravan_pipeline_state`) は trail-caravan-book 側 (run*Incremental) に閉じている。
 *
 * `wave_start:memory` を購読する (Wave 3 開始時に発火)。stage=memory の単独実行
 * (Wave 1/2 skip で `wave_complete:primary` が出ない) でも発火するため、stage に依存しない。
 * Wave 2 末尾の `PersistAnalyzer` save → Wave 3 開始 (`wave_start:memory`) の順序は
 * `LepOrchestrator` の Wave 境界 drain により保証される。
 */
export abstract class CaravanAnalyzerBase implements Analyzer {
  abstract readonly id: string;
  readonly tier = 3 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['wave_start'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];
  readonly inputMode = 'event' as const;
  readonly dependsOn: readonly string[] = [];
  readonly requiresLlm: Analyzer['requiresLlm'] = undefined;

  constructor(protected readonly provider: CaravanWaveSessionProvider) {}

  /** この analyzer が担当する scope を実行する。 */
  protected abstract runScope(session: CaravanDbSession): Promise<ScopeResult>;

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'wave_start' || e.wave !== 'memory') return;

    // Pre-flight: LLM を要する analyzer は availability を満たさなければ skip する。
    // run*Incremental を呼ばないため cursor (caravan_pipeline_state) は前進せず、
    // Ollama 復旧後の次 run で取りこぼしを回収する (high water mark 保護)。
    if (this.requiresLlm) {
      const availability = await this.provider.getAvailability();
      if (availability) {
        const { satisfied, missing, detail } = evaluateLlmRequirement(this.requiresLlm, availability);
        if (!satisfied) {
          ctx.logger.info(
            `[${this.id}] skip: LLM unavailable (missing: ${missing.join('+')}; ${detail}). ` +
              `cursor unchanged. ${ollamaUnavailableHint(this.provider.ollamaBaseUrl)}`,
          );
          await ctx.bus.publish({
            kind: 'wave_skipped',
            wave: 'memory',
            reason: `llm_unavailable: ${this.id} needs ${missing.join('+')}`,
          });
          return;
        }
      }
    }

    const session = await this.provider.ensure();
    if (!session) {
      ctx.logger.info(`[${this.id}] skip: trail-caravan-book session unavailable (activity.db missing)`);
      return;
    }

    ctx.logger.info(`[${this.id}] start`);
    const result = await this.runScope(session);
    ctx.logger.info(`[${this.id}] done (scope=${result.scope}, status=${result.status})`);
    if (result.status === 'error') {
      throw new Error(result.error ?? `${this.id} failed`);
    }
  }
}
