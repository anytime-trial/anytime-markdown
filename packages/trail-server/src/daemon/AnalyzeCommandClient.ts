// analyzeCurrentCode / analyzeReleaseCode の IPC プロキシ。extension はこの client を直接呼び出して
// daemon 内のパイプライン実装を呼び出す。Phase 2 の AnalyzeAllRunnerClient パターンを踏襲。

import type { TrailDaemonHost } from './TrailDaemonHost';
import type {
  SerializableAnalyzeCurrentCodeRequest,
  SerializableAnalyzeReleaseCodeRequest,
} from './trailDaemonProtocol';

export class AnalyzeCommandClient {
  constructor(private readonly host: TrailDaemonHost) {}

  /**
   * daemon 内で runAnalyzeCurrentCodePipeline を実行する。
   * 戻り値は `AnalyzeCurrentResult` に対応するが、export されていないため
   * consumer 側で cast する。
   */
  analyzeCurrentCode(req: SerializableAnalyzeCurrentCodeRequest): Promise<unknown> {
    return this.host.call('analyzeCurrentCode', req);
  }

  /**
   * daemon 内で runAnalyzeReleaseCodePipeline を実行する。
   * 戻り値は `AnalyzeReleaseResult` に対応するが、export されていないため
   * consumer 側で cast する。
   */
  analyzeReleaseCode(req: SerializableAnalyzeReleaseCodeRequest): Promise<unknown> {
    return this.host.call('analyzeReleaseCode', req);
  }
}
