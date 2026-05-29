// AnalyzeAllRunner の IPC プロキシ。extension はこの client を直接呼び出して
// daemon 内の実 AnalyzeAllRunner を操作する。BaseRunner の public API と互換性を持つ
// (extension / TrailDataServer 両方の使用方法に追従)。

import type { RunnerStatus } from '@anytime-markdown/memory-core';

import type { TrailDaemonHost } from './TrailDaemonHost';
import type { RunReason, SerializableAnalyzeAllConfig } from './trailDaemonProtocol';

export class AnalyzeAllRunnerClient {
  constructor(
    private readonly host: TrailDaemonHost,
    private readonly config: SerializableAnalyzeAllConfig,
  ) {}

  /** daemon 内で MemoryCoreService + AnalyzeAllRunner を組み立てる。最初の一度だけ呼ぶ。 */
  async configure(): Promise<void> {
    await this.host.call('configure', this.config);
  }

  async runOnce(reason: RunReason): Promise<RunnerStatus> {
    return (await this.host.call('runOnce', { reason })) as RunnerStatus;
  }

  /** BaseRunner.start は同期 (void)。クライアント側も同期 API を保つため fire-and-forget。 */
  start(intervalMs: number, options: { runOnStart?: boolean; startupDelayMs?: number } = {}): void {
    void this.host.call('start', { intervalMs, options });
  }

  /** BaseRunner.stop と同様に同期 void。 */
  stop(): void {
    void this.host.call('stop');
  }

  async pause(by: string): Promise<RunnerStatus> {
    return (await this.host.call('pause', { by })) as RunnerStatus;
  }

  async resume(): Promise<RunnerStatus> {
    return (await this.host.call('resume')) as RunnerStatus;
  }

  /** BaseRunner.getStatus は同期だが IPC のため非同期化。consumer 側で await が必要。 */
  async getStatus(): Promise<RunnerStatus> {
    return (await this.host.call('getStatus')) as RunnerStatus;
  }

  /**
   * 直近の Wave 1 (importAll) 結果。型は trail-server/runner/AnalyzeAllRunner の
   * ローカル型 `ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>`
   * に対応するが、export されていないため client では unknown で pass-through する。
   */
  async getLastImportResult(): Promise<unknown | null> {
    return await this.host.call('getLastImportResult');
  }

  async dispose(): Promise<void> {
    await this.host.call('dispose');
  }
}
