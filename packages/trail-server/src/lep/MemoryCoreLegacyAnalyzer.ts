import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
  MemoryCoreService,
} from '@anytime-markdown/memory-core';

/**
 * 既存 `MemoryCoreService.runOnce()` を 1 個の Layer 3 analyzer として LEP に載せる。
 *
 * `wave_complete:primary` を購読し、importAll の完了後に runOnce を呼ぶ。
 * `MemoryCoreService.runOnce` は例外を吸収するため、`getStatus()` の lastRunAt
 * 差分で「この run で実際に走ったか」を判定し、走った上で lastError が非 null の
 * 場合のみ onEvent から throw する (LepOrchestrator が errors map に収集する)。
 */
export class MemoryCoreLegacyAnalyzer implements Analyzer {
  readonly id = 'MemoryCoreLegacy';
  readonly tier = 3 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['wave_complete'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  constructor(private readonly memoryCoreService: MemoryCoreService) {}

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'wave_complete' || e.wave !== 'primary') return;

    ctx.logger.info(`[MemoryCoreLegacy] start (reason=${ctx.reason})`);

    const memBefore = this.memoryCoreService.getStatus();
    const memAfter = await this.memoryCoreService.runOnce(ctx.reason);
    const memRan = memAfter.lastRunAt !== memBefore.lastRunAt;
    const memError = memRan && memAfter.lastError !== null ? memAfter.lastError : null;

    ctx.logger.info(
      `[MemoryCoreLegacy] done (ran=${memRan}, error=${memError ? `"${memError}"` : 'null'})`,
    );

    if (memError) {
      throw new Error(memError);
    }
  }
}
