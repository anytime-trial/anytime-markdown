import type { Analyzer, AnalyzerContext, AnalyzerEvent, EventBusPublisher } from './types';

/**
 * Layered Event Pipeline 用 in-memory pub/sub バス。
 *
 * Step 1 では DB 永続化なし。subscribe / publish のみ提供する。
 * publish は subscribe 順に subscriber の onEvent を **await して** 順次呼び出す。
 *
 * subscriber が throw した場合、`errorCollector` が設定されていれば
 * `analyzer.id` をキーに収集する (orchestrator がまとめて扱う)。
 * 設定されていなければ throw を再 throw する。
 *
 * AnalyzerContext は run 単位で変わるため、`beginRun(ctx, errorCollector)` で
 * 1 run 分のコンテキストをセットし、`endRun()` でクリアする運用にする。
 */
export class EventBus implements EventBusPublisher {
  private readonly subscribers = new Map<AnalyzerEvent['kind'], Set<Analyzer>>();
  private currentCtx: AnalyzerContext | null = null;
  private currentErrors: Map<string, Error> | null = null;

  /** Analyzer の subscribes に応じて該当 kind の購読者集合に登録する。 */
  subscribe(analyzer: Analyzer): void {
    for (const kind of analyzer.subscribes) {
      let set = this.subscribers.get(kind);
      if (!set) {
        set = new Set();
        this.subscribers.set(kind, set);
      }
      set.add(analyzer);
    }
  }

  /** 1 run 分の AnalyzerContext と error collector をセットする。 */
  beginRun(ctx: AnalyzerContext, errorCollector?: Map<string, Error>): void {
    this.currentCtx = ctx;
    this.currentErrors = errorCollector ?? null;
  }

  /** 1 run 終了時に呼び、コンテキストをクリアする。 */
  endRun(): void {
    this.currentCtx = null;
    this.currentErrors = null;
  }

  /**
   * イベントを subscriber に同期的 (順次 await) に配信する。
   *
   * - currentCtx が未設定の場合は何もせずに return (defensive)
   * - 該当 kind の subscriber がいない場合は何もせずに return
   * - subscriber の onEvent が throw した場合:
   *   - errorCollector があれば `analyzer.id` をキーに保存
   *   - なければ再 throw
   */
  async publish(e: AnalyzerEvent): Promise<void> {
    if (!this.currentCtx) return;
    const subs = this.subscribers.get(e.kind);
    if (!subs || subs.size === 0) return;

    const ctx = this.currentCtx;
    for (const a of subs) {
      if (!a.onEvent) continue;
      try {
        await a.onEvent(e, ctx);
      } catch (err) {
        const e2 = err instanceof Error ? err : new Error(String(err));
        if (this.currentErrors) {
          this.currentErrors.set(a.id, e2);
        } else {
          throw e2;
        }
      }
    }
  }

  /** テスト・診断用: 特定 kind の subscriber 数を返す。 */
  subscriberCount(kind: AnalyzerEvent['kind']): number {
    return this.subscribers.get(kind)?.size ?? 0;
  }
}
