export { searchCaravanBook, vectorTopK } from './retrieve/searchCaravanBook';
export type { SearchInput, SearchResult, SearchEntity, SearchEdge, SearchEpisode } from './retrieve/searchCaravanBook';
export { openCaravanBookDb } from './db/connection';
// テストが実 migration でスキーマを組めるようにする（手書き DDL だと
// migration 側の変更に追随せず、乖離を検知できないまま緑になる）。
export { runMigrations } from './db/migrations/runner';
export type { CaravanBookDb, OpenCaravanBookDbOptions } from './db/connection';
export { getCaravanBookDbPath, getTrailHome } from './db/paths';
export { attachTrailDbReadOnly, attachTrailDbFromHandle } from './db/attach';
export { backupCaravanBookDbFile } from './db/backup';
export type { BackupCaravanBookDbOptions } from './db/backup';
export { BetterSqlite3CaravanDb } from './db/connection/BetterSqlite3CaravanDb';
export type { BetterSqlite3CaravanDbOptions } from './db/connection/BetterSqlite3CaravanDb';
export type {
  CaravanDbConnection,
  CaravanDbStatement,
  ExecResultColumn,
  RowObject,
  RunResult,
  SqlValue as CaravanDbSqlValue,
} from './db/connection/types';
export type { CaravanLogger } from './logger';
export { noopLogger } from './logger';
export {
  allWorkspacesScope,
  ownWorkspaceScope,
  resolveWorkspaceScope,
  workspaceScopeSql,
} from './ingest/workspaceScope';
export type {
  MemoryWorkspaceScope,
  SqlPredicate as WorkspaceScopeSqlPredicate,
  WorkspaceScopeMode,
} from './ingest/workspaceScope';
export {
  countForeignWorkspaceMemory,
  unsafePurgeForeignWorkspaceMemory,
} from './maintenance/purgeForeignWorkspaceMemory';
export type {
  ForeignWorkspaceMemoryCounts,
  ForeignWorkspaceMemoryInput,
} from './maintenance/purgeForeignWorkspaceMemory';
export {
  countForeignKeyViolations,
  countRepairableDanglingReferences,
  unsafeRepairDanglingReferences,
} from './maintenance/repairDanglingReferences';
export type { DanglingReferenceCounts } from './maintenance/repairDanglingReferences';
export { rebuildContentlessFtsIndexes } from './maintenance/rebuildContentlessFts';
export type { RebuildContentlessFtsResult } from './maintenance/rebuildContentlessFts';
export { runConversationIncremental } from './pipeline/runConversationIncremental';
export type { IncrementalResult } from './pipeline/runConversationIncremental';
export {
  runConversationBackfill,
  DEFAULT_CONVERSATION_BACKFILL_DAYS,
} from './pipeline/runConversationBackfill';
export type { BackfillResult } from './pipeline/runConversationBackfill';
export { detectBackfillWindowExpansion } from './pipeline/detectBackfillWindowExpansion';
export type {
  DetectBackfillWindowExpansionInput,
  DetectBackfillWindowExpansionResult,
} from './pipeline/detectBackfillWindowExpansion';
export { runConversationFailedItemsRetry } from './pipeline/runConversationFailedItemsRetry';
export type { FailedItemsRetryResult } from './pipeline/runConversationFailedItemsRetry';
export { runPipelineWatchdog } from './pipeline/pipelineWatchdog';
export type { PipelineWatchdogResult } from './pipeline/pipelineWatchdog';
export type { CodeIncrementalResult } from './pipeline/runCodeIncremental';
export { runBugHistoryIncremental } from './pipeline/runBugHistoryIncremental';
export type { BugHistoryIncrementalResult } from './pipeline/runBugHistoryIncremental';
export { ingestAstFacts } from './ingest/code/astFunctionLevel';
export type { AstFactInput, AstFactStats } from './ingest/code/astFunctionLevel';
export type { IngestDecisionCommentsInput, ExtractCommentsStats, DecisionCommentItem } from './ingest/code/extractComments';
export { extractCommitRationale } from './ingest/code/extractCommitRationale';
export type { ExtractRationaleInput, ExtractRationaleStats } from './ingest/code/extractCommitRationale';
export { runReviewIncremental } from './pipeline/runReviewIncremental';
export type { ReviewIncrementalResult } from './pipeline/runReviewIncremental';
export { ingestAgentReviewResult } from './ingest/review/ingestAgentReviewResult';
export type { IngestAgentReviewResult } from './ingest/review/ingestAgentReviewResult';
export { ingestPrReview, buildPrReviewSourceRef, parsePrReviewSourceRef } from './ingest/pr-review/ingestPrReview';
export type {
  PrReviewIngestInput,
  PrReviewIngestResult,
  PrReviewFindingInput,
  ParsedPrReviewSourceRef,
} from './ingest/pr-review/ingestPrReview';
export { runAgentRunWatchdog } from './ingest/review/agentRunWatchdog';
export type { AgentRunWatchdogResult } from './ingest/review/agentRunWatchdog';
export { AgentReviewInputSchema, AgentReviewFindingSchema } from './types/AgentReviewInput';
export type { AgentReviewInput, AgentReviewFinding } from './types/AgentReviewInput';

export { runSpecIncremental } from './pipeline/runSpecIncremental';
export type { SpecIncrementalResult } from './pipeline/runSpecIncremental';
export { runReviewBackfill } from './pipeline/runReviewBackfill';
export { runReviewFindingExtraction } from './pipeline/runReviewFindingExtraction';
export type { ReviewFindingExtractionResult } from './pipeline/runReviewFindingExtraction';
export type { ReviewBackfillResult } from './pipeline/runReviewBackfill';
export { runSpecReconciliation } from './pipeline/runSpecReconciliation';
export type { SpecReconciliationResult } from './pipeline/runSpecReconciliation';

export { listRecurringBugs } from './retrieve/listRecurringBugs';
export type { RecurringBugGroup, BugFixSummary } from './retrieve/listRecurringBugs';
export { getBugHistory } from './retrieve/getBugHistory';
export type { BugHistoryEntry, CausedByRef } from './retrieve/getBugHistory';

export { listUnaddressedReviewFindings } from './retrieve/listUnaddressedReviewFindings';
export type { UnaddressedReviewFinding } from './retrieve/listUnaddressedReviewFindings';
export { getReviewHistory } from './retrieve/getReviewHistory';
export type { ReviewHistoryEntry, ReviewFindingSummary } from './retrieve/getReviewHistory';
export { linkReviewToCommit } from './retrieve/linkReviewToCommit';
export type { LinkReviewToCommitResult } from './retrieve/linkReviewToCommit';

export { runReviewAgent } from './retrieve/runReviewAgent';
export type { RunReviewAgentResult } from './retrieve/runReviewAgent';
export { getReviewRunStatus } from './retrieve/getReviewRunStatus';
export type { ReviewRunStatus } from './retrieve/getReviewRunStatus';
export { listReviewRuns } from './retrieve/listReviewRuns';
export { listReviewTargetHints } from './retrieve/listReviewTargetHints';
export type { ReviewTargetHint } from './retrieve/listReviewTargetHints';

export { detectDrift } from './retrieve/detectDrift';
export type { DriftEventSummary, DetectDriftInput } from './retrieve/detectDrift';
export { explainDrift } from './retrieve/explainDrift';
export type { ExplainDriftResult, DriftSourceEvidence } from './retrieve/explainDrift';
export { resolveDrift } from './retrieve/resolveDrift';
export type { ResolveDriftResult } from './retrieve/resolveDrift';

export { runDriftDetection } from './pipeline/runDriftDetection';
export type { DriftDetectionResult } from './pipeline/runDriftDetection';

export { runEmbeddingBackfill } from './pipeline/runEmbeddingBackfill';
export type { EmbeddingBackfillResult } from './pipeline/runEmbeddingBackfill';

export { runCodeReconciliation } from './pipeline/runCodeReconciliation';
export type { CodeReconciliationResult } from './pipeline/runCodeReconciliation';

export { PipelineStatusWriter } from './status/PipelineStatusWriter';
export type {
  PipelineStatusFile,
  PipelineStatusEntry,
  PipelineState,
} from './status/PipelineStatusWriter';
export { PIPELINE_SCOPES } from './service/pipelineScopes';

export { runRagFtsRebuild } from './pipeline/runRagFtsRebuild';
export type {
  RunRagFtsRebuildInput,
  RunRagFtsRebuildResult,
  RunRagFtsRebuildTrigger,
} from './pipeline/runRagFtsRebuild';
export {
  upsertEntityFts,
  deleteEntityFts,
  upsertEpisodeFts,
  deleteEpisodeFts,
  upsertDriftFts,
  deleteDriftFts,
  aliasesJsonToText,
  buildEntityAliasesText,
} from './rag/ftsSync';

export { tokenizeForFts5 } from './rag/tokenizeForFts5';
export { splitIdentifierSubtokens } from './rag/identifierTokens';
export { isLowInformationEntity } from './canonical/entityQuality';
export { reciprocalRankFusion } from './rag/reciprocalRankFusion';
export type { RankedItem, FusedItem, RankSource } from './rag/reciprocalRankFusion';
export { hybridSearchCaravanBook } from './rag/hybridSearchCaravanBook';
export type {
  HybridSearchInput,
  HybridSearchOptions,
  HybridSearchResult,
} from './rag/hybridSearchCaravanBook';

export type { ChatMessage, ChatTurnInput, ChatChunk, ChatFilters } from './chat/types';
export { buildPrompt } from './chat/promptBuilder';
export type { BuildPromptInput, PromptSource } from './chat/promptBuilder';
export { CitationStreamParser } from './chat/citationParser';
export { ChatService } from './chat/ChatService';
export type { ChatServiceOptions } from './chat/ChatService';

export type { CaravanBookService } from './service/CaravanBookService';
export type {
  CaravanDbSession,
  ScopeResult,
  CaravanBookScopeRunner,
  CaravanDbSessionDeps,
} from './service/CaravanDbSession';
export { defaultState, readState, writeState, STATE_SCHEMA_VERSION } from './service/state';
export type { ReadStateOptions } from './service/state';
export type {
  CaravanBookLogSink,
  CaravanBookServiceOptions,
  CaravanBookServiceStartOptions,
  CaravanBookServiceStatus,
  PipelineLogger,
  PipelineRunnerContext,
  RunReason,
} from './service/types';

// 共通 Runner 抽象 (AnalyzeAllRunner などの subclass 実装用)
export { BaseRunner } from './runner/BaseRunner';
export type {
  BaseRunnerOptions,
  RunnerLogSink,
  RunnerStartOptions,
  RunnerStatus,
} from './runner/types';

// Layered Event Pipeline (LEP) — 型・EventBus・Orchestrator・BaseAnalyzer
export {
  EventBus,
  LepOrchestrator,
  BaseAnalyzer,
  LEP_STAGES,
  stageIncludesMemory,
  topoSortByDependsOn,
} from './lep';
export type {
  PipelineRunLedgerFactory,
  AnalyzerEvent,
  Analyzer,
  AnalyzerContext,
  EventBusPublisher,
  LepRunOnceOptions,
  LepRunOnceResult,
  LepStage,
} from './lep';
