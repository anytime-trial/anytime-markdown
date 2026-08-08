import type { Analyzer, AnalyzerContext, AnalyzerEvent, EventBusPublisher } from './types';

/**
 * Layered Event Pipeline 用 in-memory pub/sub バス。
 *
 * publish は subscribe 順に subscriber の onEvent を **await して** 順次呼び出す。
 * subscriber が throw した場合、`errorCollector` が設定されていれば
 * `analyzer.id` をキーに収集する。設定されていなければ throw を再 throw する。
 *
 * AnalyzerContext は run 単位で変わるため、`beginRun(ctx, errorCollector)` で
 * 1 run 分のコンテキストをセットし、`endRun()` でクリアする。
 *
 * `drain()` は in-flight な publish が全て完了するまで待つ barrier。
 * subscriber が onEvent 内で更に publish した場合の連鎖も含めて完了を保証する。
 */
export class EventBus implements EventBusPublisher {
  private readonly subscribers = new Map<AnalyzerEvent['kind'], Set<Analyzer>>();
  private currentCtx: AnalyzerContext | null = null;
  private currentErrors: Map<string, Error> | null = null;
  /** publish 開始 (subscriber 配信開始時) で +1、終了で -1 する in-flight カウンタ */
  private inFlight = 0;

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
    this.inFlight = 0;
  }

  /** 1 run 終了時に呼び、コンテキストをクリアする。 */
  endRun(): void {
    this.currentCtx = null;
    this.currentErrors = null;
    this.inFlight = 0;
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

    this.inFlight++;
    try {
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
    } finally {
      this.inFlight--;
    }
  }

  /**
   * in-flight な publish が全て完了するまで待つ。
   *
   * subscriber が onEvent 内でさらに publish する場合 (event 連鎖) の完了も保証する。
   * Wave 境界で `await bus.drain()` を呼ぶことで、当該 Wave の event 伝播が完了
   * してから次 Wave に進める。
   *
   * 各反復で `setImmediate` 相当 (`setTimeout(0)`) で macrotask を 1 つ消化する。
   * subscriber が setTimeout / fs / network 等の macrotask に依存する場合でも
   * progress するように、microtask のみの yield では足りない。
   */
  async drain(): Promise<void> {
    while (this.inFlight > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  /** テスト・診断用: 特定 kind の subscriber 数を返す。 */
  subscriberCount(kind: AnalyzerEvent['kind']): number {
    return this.subscribers.get(kind)?.size ?? 0;
  }
}
