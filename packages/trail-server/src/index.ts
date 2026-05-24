export const TRAIL_SERVER_VERSION = '0.18.0';

export { TrailDataServer } from './server/TrailDataServer';
export { MemoryApiHandler } from './server/MemoryApiHandler';
export type * from './server/types';

export { CodeGraphService } from './analyze/CodeGraphService';
export { GraphQueryEngine } from './analyze/GraphQueryEngine';
export {
  findTsconfigCandidates,
  hasPythonFiles,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from './analyze/AnalyzePipeline';
export { computeAndPersistFileAnalysis } from './analyze/computeAndPersistFileAnalysis';
export type * from './analyze/CodeGraph.types';

export type { Disposable } from './runtime/Disposable';
export { DisposableStore } from './runtime/Disposable';

export { RebuildScheduler } from './memory-chat/rebuildScheduler';
export type { RebuildSchedulerLogger, RebuildSchedulerOptions } from './memory-chat/rebuildScheduler';

export { ChatBridge } from './memory-chat/chatBridge';
export type { ChatBridgeLogger, ChatBridgeConfig, ChatBridgeDeps } from './memory-chat/chatBridge';
export type { MemoryChatLogger } from './memory-chat/types';

export { createMemoryCoreRunner } from './runtime/memoryCoreRunner';
export type { MemoryCoreRunner, MemoryCoreOutputChannel } from './runtime/memoryCoreRunner';

export {
  MemoryCoreService,
  defaultStatePath as memoryCoreServiceDefaultStatePath,
  defaultState as memoryCoreServiceDefaultState,
  readState as memoryCoreServiceReadState,
  writeState as memoryCoreServiceWriteState,
  STATE_SCHEMA_VERSION as MEMORY_CORE_SERVICE_STATE_SCHEMA_VERSION,
} from '@anytime-markdown/memory-core';
export type {
  MemoryCoreLogSink,
  MemoryCoreServiceOptions,
  MemoryCoreServiceStartOptions,
  MemoryCoreServiceStatus,
  RunReason as MemoryCoreRunReason,
} from '@anytime-markdown/memory-core';

export type { Logger, LogLevel } from './runtime/Logger';
export { ConsoleLogger, FileLogger } from './runtime/Logger';

export { LogService } from './services/LogService';
export type {
  LogEntry,
  LogSource,
  PersistedLogEntry,
  LogBroadcaster,
  QueryParams,
  QueryResult,
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
  disabledMemoryAnalyzerIds,
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
  LepMemoryConfig,
  LepGitHubSourceConfig,
  LepSourcesConfig,
  ResolvedGitHubSource,
  LegacyLepConfigInput,
  LoadLepConfigOptions,
  MigrateConfigJsonOptions,
  MigrateConfigJsonResult,
  MemoryAnalyzerId,
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
