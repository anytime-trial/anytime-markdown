export { FlightRecordDatabase } from './FlightRecordDatabase';
export type { FlightRecordDatabaseOptions } from './FlightRecordDatabase';
// バンドル済み better_sqlite3.node のパス構成を知る唯一の関数。trail-db 外（trail-server /
// 拡張本体）が trail-caravan-book へ nativeBinding を渡すときも、パスを組み立て直さずこれを使う。
export { resolveBundledNativeBinding } from './internal/loadBetterSqlite3';
export {
  TrailDatabase,
  InMemoryTrailStorage,
  defaultTemporalCouplingPathFilter,
  stripWorktreePrefix,
  SESSION_COUPLING_EDIT_TOOLS,
  CODEX_SUBAGENT_TYPE,
  INSERT_MESSAGE,
  estimateCost,
} from './TrailDatabase';
export type {
  AnalyzeFunction,
  DecisionCommentInput,
  DecisionCommentRow,
  SessionRow,
  MessageRow,
  SessionCommitRow,
  AnalyticsData,
  CostOptimizationData,
  TemporalCouplingGranularity,
  ActivityTrendGranularity,
  FetchTemporalCouplingOptions,
  FetchDefectRiskOptions,
  ImportAllPhase,
  ImportAllPhaseEvent,
  ImportAllLepOptions,
  DoraReleaseInput,
  DoraCommitInput,
  DoraMetricRow,
  PrReviewRow,
  PrReviewFindingRow,
  CorrelationSessionCommit,
  CorrelationCommitFile,
  CrossSourceCorrelationRow,
  CrossSourceAKind,
  CrossSourceBKind,
  CommitCodeGraphAvailability,
  ReleaseCodeGraphAvailability,
} from './TrailDatabase';
export { SyncService } from './SyncService';
export { SupabaseTrailStore } from './SupabaseTrailStore';
export { PostgresTrailStore } from './PostgresTrailStore';
export type { IRemoteTrailStore } from './IRemoteTrailStore';
export type { ITrailStorage } from './ITrailStorage';
export { SqliteSessionRepository } from './SqliteSessionRepository';
export { DatabaseIntegrityMonitor } from './DatabaseIntegrityMonitor';
export { FileKnowledgeBaseSnapshotter, KB_SNAPSHOT_DEBOUNCE_MINUTES, KB_SNAPSHOT_GENERATIONS } from './KnowledgeBaseSnapshotter';
export { ExecFileGitService } from './ExecFileGitService';
export { extractRepoNameFromJsonl } from './sessionMeta';
export { toUTC } from './dateUtils';
export { MetricsThresholdsLoader } from './MetricsThresholdsLoader';
export type { DbLogger } from './DbLogger';
export { noopDbLogger } from './DbLogger';
export {
  FileChangeResolver,
  countExportLinesByFile,
  parseNumstat,
} from './FileChangeResolver';
export type { FileChangeResolverOptions } from './FileChangeResolver';
export { unquoteGitPath } from './gitPath';
export { SpecDocIndex, extractC4ScopeFromFrontmatter } from './SpecDocIndex';
export type { SpecDocIndexOptions } from './SpecDocIndex';
export { WorkspaceC4ElementProvider } from './WorkspaceC4ElementProvider';
export type { WorkspaceC4ElementProviderOptions } from './WorkspaceC4ElementProvider';
export { resolveDbWithLegacyRename } from './legacyDbRename';
export type { ResolveDbWithLegacyRenameOptions, ResolvedDbFile } from './legacyDbRename';
