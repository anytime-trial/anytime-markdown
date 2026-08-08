export const TRAIL_SERVER_VERSION = '0.18.0';

export { TrailDataServer } from './server/TrailDataServer';
export type { AnalyzeAllPipelineResult } from './server/TrailDataServer';
export { CaravanApiHandler } from './server/CaravanApiHandler';
export type * from './server/types';

export { CodeGraphService } from './analyze/CodeGraphService';
export { GraphQueryEngine } from './analyze/GraphQueryEngine';
export { findTsconfigCandidates, hasPythonFiles } from './analyze/analyzeUtils';
export type { TsconfigCandidate } from './analyze/analyzeUtils';
export {
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from './analyze/AnalyzePipeline';
export type { AnalyzeComputeMode } from './analyze/AnalyzePipeline';
export { computeAndPersistFileAnalysis } from './analyze/computeAndPersistFileAnalysis';
export type * from './analyze/CodeGraph.types';

export type { Disposable } from './runtime/Disposable';
export { DisposableStore } from './runtime/Disposable';

export { RebuildScheduler } from './caravan-chat/rebuildScheduler';
export type { RebuildSchedulerLogger, RebuildSchedulerOptions } from './caravan-chat/rebuildScheduler';

export { ChatBridge } from './caravan-chat/chatBridge';
export type { ChatBridgeLogger, ChatBridgeConfig, ChatBridgeDeps } from './caravan-chat/chatBridge';
export type { CaravanChatLogger } from './caravan-chat/types';

// createCaravanBookRunner 値は CaravanBookService 経由で ts を引き込むため
// `@anytime-markdown/trail-server/pipeline` subpath へ分離した (root は ts-free)。
export type { CaravanBookRunner, CaravanBookOutputChannel } from './runtime/caravanBookRunner';

// CaravanBookService / defaultStatePath の **値** は ts を引き込むため
// `@anytime-markdown/trail-server/pipeline` subpath へ分離した (root は ts-free)。
// 型のみ参照する thin client は root の `export type {...} from 'trail-caravan-book'`
// (下記 type 専用ブロック) を経由する。
export type { CaravanBookService } from '@anytime-markdown/trail-caravan-book';
export {
  defaultState as caravanBookServiceDefaultState,
  readState as caravanBookServiceReadState,
  writeState as caravanBookServiceWriteState,
  STATE_SCHEMA_VERSION as MEMORY_CORE_SERVICE_STATE_SCHEMA_VERSION,
} from '@anytime-markdown/trail-caravan-book';
export type {
  CaravanBookLogSink,
  CaravanBookServiceOptions,
  CaravanBookServiceStartOptions,
  CaravanBookServiceStatus,
  RunReason as CaravanBookRunReason,
} from '@anytime-markdown/trail-caravan-book';

export type { Logger, LogLevel } from './runtime/Logger';
export { ConsoleLogger, FileLogger } from './runtime/Logger';

export { LogService } from './services/LogService';
export type {
  LogEntry,
  LogSource,
} from './services/LogService';
export { LogSink, combineLoggers } from './services/LogSink';

export {
  DEFAULT_LEP_CONFIG,
  LEP_CONFIG_VERSION,
  LepConfigError,
  MEMORY_ANALYZER_IDS,
  AGGREGATOR_ANALYZER_IDS,
  KNOWN_ANALYZER_IDS,
  disabledAnalyzerIds,
  disabledCaravanAnalyzerIds,
  ensureLepConfigFile,
  loadLepConfig,
  lepConfigSearchPaths,
  mergeLepConfig,
  migrateLegacyToLepConfig,
  legacyFromConfigJson,
  migrateConfigJsonIntoLepJson,
  validateLepConfigInput,
  workspaceLepConfigPath,
  workspaceConfigJsonPath,
  resolveGitHubSource,
  resolveExcludeRoot,
} from './runtime/LepConfig';
export type {
  LepConfig,
  LepConfigLoadResult,
  LepAnalyzersConfig,
  LepAnalyzerToggle,
  LepLlmConfig,
  LepLogLevel,
  LepOllamaProviderConfig,
  LepScheduleConfig,
  LepRagConfig,
  LepFtsConfig,
  LepConversationConfig,
  LepCaravanConfig,
  LepGitHubSourceConfig,
  LepSourcesConfig,
  ResolvedGitHubSource,
  LegacyLepConfigInput,
  LoadLepConfigOptions,
  MigrateConfigJsonOptions,
  MigrateConfigJsonResult,
  CaravanAnalyzerId,
  AggregatorAnalyzerId,
  PartialLepConfig,
} from './runtime/LepConfig';

export { DaemonScheduler } from './runtime/DaemonScheduler';
export type { ScheduledJob, JobResult } from './runtime/DaemonScheduler';

export {
  checkLlmAvailability,
  checkOllamaModelAvailable,
  evaluateLlmRequirement,
  ollamaUnavailableHint,
} from './lep/LlmAvailability';
export type {
  LlmCapabilityStatus,
  LlmProviderAvailability,
  CheckLlmAvailabilityOptions,
} from './lep/LlmAvailability';

export { DaemonLifecycle } from './runtime/DaemonLifecycle';
export type { DaemonInfo, DaemonLifecycleOptions } from './runtime/DaemonLifecycle';

export { AnalyzeAllRunner, defaultAnalyzeAllStatePath } from './runner/AnalyzeAllRunner';
export type { AnalyzeAllRunnerOptions } from './runner/AnalyzeAllRunner';

// LEP 新ソース参照実装 (Step 4b): GitHub PR review Ingester + REST クライアント
export {
  GitHubPrReviewIngester,
  defaultGitRemoteReader,
} from './lep/ingesters/GitHubPrReviewIngester';
export type {
  GitHubPrReviewIngesterOptions,
  GitRemoteReader,
} from './lep/ingesters/GitHubPrReviewIngester';
export { createFetchGitHubReviewClient } from './lep/ingesters/github/GitHubReviewClient';
export type {
  GitHubReviewClient,
  GitHubPullSummary,
  GitHubReviewDto,
  GitHubReviewCommentDto,
  FetchGitHubReviewClientOptions,
} from './lep/ingesters/github/GitHubReviewClient';
export { parseGitHubRemote } from './lep/ingesters/github/parseGitHubRemote';
export type { GitHubRepoRef } from './lep/ingesters/github/parseGitHubRemote';

export {
  ImportAllPhaseStatusWriter,
  readImportAllPhaseStatus,
} from './jobs/ImportAllPhaseStatusFile';
export type {
  ImportAllPhaseStatusFile,
  ImportAllPhaseEntry,
  ImportAllPhaseState,
} from './jobs/ImportAllPhaseStatusFile';
