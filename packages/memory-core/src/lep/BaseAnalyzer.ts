import type { Analyzer, AnalyzerContext, AnalyzerEvent } from './types';

/**
 * Analyzer 実装の共通基底。
 *
 * Step 1 では薄いヘルパ。サブクラスが頻出で書くべきフィールドのデフォルト値を提供する。
 * - `emits` を `[]` で初期化
 * - 全 lifecycle hook は no-op (サブクラスで override)
 *
 * Step 2 以降で event 種別が増えた際に共通の event filter helper 等をここに追加する。
 */
export abstract class BaseAnalyzer implements Analyzer {
  abstract readonly id: string;
  abstract readonly tier: 1 | 2 | 3 | 4;
  abstract readonly subscribes: readonly AnalyzerEvent['kind'][];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    return;
  }

  async onRunEnd(_ctx: AnalyzerContext): Promise<void> {
    return;
  }

  async onEvent(_e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    return;
  }
}
