import type { MemoryDbSession } from '@anytime-markdown/memory-core';

/** Wave 3 開始時に memory-core セッションを open するファクトリ。null = trail.db 不在。 */
export type MemoryDbSessionFactory = () => Promise<MemoryDbSession | null>;

/**
 * Wave 3 の 7 memory analyzer が共有する {@link MemoryDbSession} の遅延 open / close 管理。
 *
 * - `ensure()`: 最初の呼び出しでセッションを open し、以降は同じインスタンスを返す
 *   (analyzer ごとに DB を open すると ATTACH 競合・性能劣化するため共有が必須)。
 * - `closeIfOpen()`: Wave 3 完了後に `AnalyzeAllRunner` が 1 回呼んで close する。
 *
 * factory が `null` を返した場合 (trail.db 不在) は open 済み扱いにし、各 analyzer は skip する。
 */
export class MemoryWaveSessionProvider {
  private session: MemoryDbSession | null = null;
  private opened = false;

  constructor(private readonly factory: MemoryDbSessionFactory) {}

  async ensure(): Promise<MemoryDbSession | null> {
    if (!this.opened) {
      this.opened = true;
      this.session = await this.factory();
    }
    return this.session;
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
