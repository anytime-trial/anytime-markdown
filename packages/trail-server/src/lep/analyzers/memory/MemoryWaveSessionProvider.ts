import type { MemoryDbSession } from '@anytime-markdown/memory-core';

import type { LlmProviderAvailability } from '../../LlmAvailability';

/** Wave 3 開始時に memory-core セッションを open するファクトリ。null = trail.db 不在。 */
export type MemoryDbSessionFactory = () => Promise<MemoryDbSession | null>;

/** Wave 3 開始前の LLM Pre-flight ヘルスチェック。 */
export type LlmAvailabilityChecker = () => Promise<LlmProviderAvailability>;

/**
 * Wave 3 の 7 memory analyzer が共有する {@link MemoryDbSession} と LLM 可用性の管理。
 *
 * - `ensure()`: 最初の呼び出しでセッションを open し、以降は同じインスタンスを返す
 *   (analyzer ごとに DB を open すると ATTACH 競合・性能劣化するため共有が必須)。
 * - `getAvailability()`: LLM Pre-flight 結果を 1 回だけ取得しキャッシュする。checker
 *   未指定時は `null` を返し、全 analyzer が LLM gating なしで実行される (従来動作)。
 * - `closeIfOpen()`: Wave 3 完了後に `AnalyzeAllRunner` が 1 回呼んで close する。
 */
export class MemoryWaveSessionProvider {
  private session: MemoryDbSession | null = null;
  private opened = false;
  private availability: LlmProviderAvailability | null = null;
  private availabilityComputed = false;

  constructor(
    private readonly factory: MemoryDbSessionFactory,
    private readonly availabilityChecker?: LlmAvailabilityChecker,
    /** ヒントメッセージ用の Ollama baseUrl。 */
    readonly ollamaBaseUrl?: string,
  ) {}

  async ensure(): Promise<MemoryDbSession | null> {
    if (!this.opened) {
      this.opened = true;
      this.session = await this.factory();
    }
    return this.session;
  }

  /** LLM Pre-flight 結果 (1 回だけ実行・キャッシュ)。checker 未指定なら null。 */
  async getAvailability(): Promise<LlmProviderAvailability | null> {
    if (!this.availabilityComputed) {
      this.availabilityComputed = true;
      this.availability = this.availabilityChecker ? await this.availabilityChecker() : null;
    }
    return this.availability;
  }

  closeIfOpen(): void {
    const s = this.session;
    this.session = null;
    this.opened = false;
    if (s) s.close();
  }

  get isOpen(): boolean {
    return this.session !== null;
  }
}
