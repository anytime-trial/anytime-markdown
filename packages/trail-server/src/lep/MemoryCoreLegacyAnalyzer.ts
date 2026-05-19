import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
  MemoryCoreService,
} from '@anytime-markdown/memory-core';

/**
 * Step 1 暫定 wrapper: 既存 `MemoryCoreService.runOnce()` を **1 個の Layer 3 analyzer**
 * として LEP に載せる。
 *
 * - `wave_complete` event を購読し、`wave === 'primary'` 受信時に runOnce を呼ぶ。
 * - 既存 AnalyzeAllRunner と同様、memBefore/memAfter の lastRunAt 差分で「この run で
 *   memory-core が実際に走ったか」を判定し、走った上で lastError が非 null の場合のみ
 *   onEvent から throw する (LepOrchestrator 側で `MemoryCoreLegacy` キーに収集される)。
 * - reason は `AnalyzerContext.reason` をそのまま渡す (manual / startup / periodic / import)。
 *
 * Step 3 で memory-core の 5 個の analyzer (conversation / code / bug-history / review /
 * watchdog) に分解される予定。
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
