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
 * - `getAvailability()`: LLM Pre-flight 結果を **run 内で 1 回だけ**取得しキャッシュする
 *   (キャッシュは `endRun()` で捨てる)。checker 未指定時は `null` を返し、全 analyzer が
 *   LLM gating なしで実行される (従来動作)。
 * - `closeIfOpen()`: セッションだけを閉じる。
 * - `endRun()`: run の終端処理。`AnalyzeAllRunner` が run の finally で 1 回呼び、
 *   セッション close と run スコープ状態 (LLM 可用性) の破棄を行う。
 */
export class CaravanWaveSessionProvider {
  private session: CaravanDbSession | null = null;
  private opened = false;
  /**
   * 計測結果ではなく計測中の Promise を持つ。フラグ + 値だと、await 前にフラグだけ
   * 立つ窓で 2 番目の呼び出しが `null` を受け取り、`CaravanAnalyzerBase` の
   * `if (availability)` を素通りして **gating 無しで実行**される（Ollama 停止中に
   * cursor が前進する方向の縮退）。Promise なら同じ計測を待つだけで済む。
   */
  private availabilityPromise: Promise<LlmProviderAvailability | null> | null = null;

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
    this.availabilityPromise ??= this.availabilityChecker
      ? this.availabilityChecker()
      : Promise.resolve(null);
    return this.availabilityPromise;
  }

  /** セッションだけを閉じる。run スコープ状態は保つ (run 途中の close 用)。 */
  closeIfOpen(): void {
    const s = this.session;
    this.session = null;
    this.opened = false;
    if (s) s.close();
  }

  /**
   * run の終端処理。セッションを閉じ、run スコープ状態 (LLM 可用性) を捨てる。
   *
   * 可用性を run スコープにするのは、provider が `AnalyzeAllRunner` のコンストラクタで
   * 1 度だけ作られ daemon の生存期間ずっと使われるためである。provider 生存期間の
   * キャッシュにすると、`CaravanAnalyzerBase` が宣言する「Ollama 復旧後の次 run で
   * 取りこぼしを回収する」が成立しない。
   *
   * 「利用不可のときだけ TTL 付きで再測定」は採らない (却下案)。キャッシュ寿命が
   * 2 種類に分かれ、いつ測り直されるかが呼び出し側から読めなくなるため。
   *
   * リセットを close より先に置くのは、`close()` が throw しても run スコープ状態を
   * 確実に捨てるため。
   */
  endRun(): void {
    this.availabilityPromise = null;
    this.closeIfOpen();
  }

  get isOpen(): boolean {
    return this.session !== null;
  }
}
