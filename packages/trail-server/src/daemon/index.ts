// trail-server/daemon の公開面。
//
// extension (拡張ホスト) はこの subpath から TrailDaemonHost / AnalyzeAllRunnerClient と
// シリアライズ型のみを import する。typescript を引く実装 (MemoryCoreService /
// AnalyzeAllRunner) は daemon 内 (`trailDaemonEntry.ts` 経由でのみロード) に閉じこめる。

export { TrailDaemonHost } from './TrailDaemonHost';
export { AnalyzeAllRunnerClient } from './AnalyzeAllRunnerClient';
export type {
  HostMessage,
  HostRequest,
  DaemonMessage,
  DaemonEvent,
  DaemonResponse,
  DaemonResponseOk,
  DaemonResponseErr,
  MethodName,
  RunReason,
  SerializableAnalyzeAllConfig,
  SerializableGitHubPrReviewConfig,
  SerializableMemoryCoreConfig,
} from './trailDaemonProtocol';
