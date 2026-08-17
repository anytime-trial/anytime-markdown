import type { CaravanDbSession } from '@anytime-markdown/trail-caravan-book';

import type { LlmProviderAvailability } from '../../LlmAvailability';

/** Wave 3 開始時に trail-caravan-book セッションを open するファクトリ。null = activity.db 不在。 */
export type CaravanDbSessionFactory = () => Promise<CaravanDbSession | null>;

/** Wave 3 開始前の LLM Pre-flight ヘルスチェック。 */
export type LlmAvailabilityChecker = () => Promise<LlmProviderAvailability>;

/**
 * Wave 3 の 7 memory analyzer が共有する {@link CaravanDbSession} と LLM 可用性の管理。
 *
 * - `ensure()`: 最初の呼び出しでセッションを open し、以降は同じインスタンスを返す
 *   (analyzer ごとに DB を open すると ATTACH 競合・性能劣化するため共有が必須)。
 * - `getAvailability()`: LLM Pre-flight 結果を 1 回だけ取得しキャッシュする。checker
 *   未指定時は `null` を返し、全 analyzer が LLM gating なしで実行される (従来動作)。
 * - `closeIfOpen()`: Wave 3 完了後に `AnalyzeAllRunner` が 1 回呼んで close する。
 */
export class CaravanWaveSessionProvider {
  private session: CaravanDbSession | null = null;
  private opened = false;
  private availability: LlmProviderAvailability | null = null;
  private availabilityComputed = false;

  constructor(
    private readonly factory: CaravanDbSessionFactory,
    private readonly availabilityChecker?: LlmAvailabilityChecker,
    /** ヒントメッセージ用の Ollama baseUrl。 */
    readonly ollamaBaseUrl?: string,
    /**
     * Ollama throttle が COOLING かを返すゲート。true のとき
     * `ConversationCaravanAnalyzer` は会話ループを中断して次 scope へ進む。
     * 未指定時は throttle スキップ無効 (従来動作)。
     */
    readonly throttleGate?: () => boolean,
  ) {}

  async ensure(): Promise<CaravanDbSession | null> {
    if (!this.opened) {
      this.opened = true;
      this.session = await this.factory();
    }
    return this.session;
  }

  /** LLM Pre-flight 結果 (run 内では 1 回だけ実行・キャッシュ)。checker 未指定なら null。 */
  async getAvailability(): Promise<LlmProviderAvailability | null> {
    if (!this.availabilityComputed) {
      this.availabilityComputed = true;
      this.availability = this.availabilityChecker ? await this.availabilityChecker() : null;
    }
    return this.availability;
  }

  /**
   * セッションを閉じ、LLM 可用性キャッシュを捨てる。
   *
   * `AnalyzeAllRunner` が run の finally で必ず呼ぶため、ここが run 境界になる。
   * 可用性を捨てるのは、provider が runner のコンストラクタで 1 度だけ作られ daemon の
   * 生存期間ずっと使われるためである。捨てないと、daemon 起動時に Ollama が落ちていた
   * 場合の「利用不可」が永久にキャッシュされ、Ollama を起動しても daemon を再起動する
   * まで LLM 依存スコープが skip され続ける (2026-08-17 実測: 会話取込が 6 日間停止した)。
   * `CaravanAnalyzerBase` が宣言している「Ollama 復旧後の次 run で取りこぼしを回収する」
   * を成立させるのはこのリセットである。
   */
  closeIfOpen(): void {
    const s = this.session;
    this.session = null;
    this.opened = false;
    this.availability = null;
    this.availabilityComputed = false;
    if (s) s.close();
  }

  get isOpen(): boolean {
    return this.session !== null;
  }
}
