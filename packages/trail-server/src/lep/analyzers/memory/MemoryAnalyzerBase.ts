import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
  MemoryDbSession,
  ScopeResult,
} from '@anytime-markdown/memory-core';

import type { MemoryWaveSessionProvider } from './MemoryWaveSessionProvider';

/**
 * Layer 3 (memory) analyzer の共通基底。
 *
 * 各 analyzer は memory-core の特定 scope を 1 つ担当する薄いラッパで、共有
 * {@link MemoryWaveSessionProvider} からセッションを取得して scope メソッドを呼ぶ。
 * cursor 管理 (`memory_pipeline_state`) は memory-core 側 (run*Incremental) に閉じている。
 *
 * Step 3b では `wave_complete:primary` を購読する (importAll 完了 = Wave 2 barrier 後に発火)。
 * Step 3d で `wave_start:memory` 購読に切り替え、stage=memory 単独実行に対応する。
 */
export abstract class MemoryAnalyzerBase implements Analyzer {
  abstract readonly id: string;
  readonly tier = 3 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['wave_complete'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];
  readonly inputMode = 'event' as const;
  readonly dependsOn: readonly string[] = [];

  constructor(protected readonly provider: MemoryWaveSessionProvider) {}

  /** この analyzer が担当する scope を実行する。 */
  protected abstract runScope(session: MemoryDbSession): Promise<ScopeResult>;

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'wave_complete' || e.wave !== 'primary') return;

    const session = await this.provider.ensure();
    if (!session) {
      ctx.logger.info(`[${this.id}] skip: memory-core session unavailable (trail.db missing)`);
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
