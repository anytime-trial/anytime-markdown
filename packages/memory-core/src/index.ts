export { searchMemory, vectorTopK } from './retrieve/searchMemory';
export type { SearchInput, SearchResult, SearchEntity, SearchEdge, SearchEpisode } from './retrieve/searchMemory';
export { openMemoryCoreDb } from './db/connection';
export type { MemoryCoreDb, MemoryCoreDbDriver, OpenMemoryCoreDbOptions } from './db/connection';
export { attachTrailDbReadOnly, attachTrailDbFromHandle } from './db/attach';
export type { AttachHandle } from './db/attach';
export { setSqlJsLoader, loadSqlJsModule } from './db/sqlJsLoader';
export { SqlJsMemoryDb } from './db/connection/SqlJsMemoryDb';
export { BetterSqlite3MemoryDb } from './db/connection/BetterSqlite3MemoryDb';
export type { BetterSqlite3MemoryDbOptions } from './db/connection/BetterSqlite3MemoryDb';
export type {
  MemoryDbConnection,
  MemoryDbStatement,
  ExecResultColumn,
  RowObject,
  RunResult,
  SqlValue as MemoryDbSqlValue,
} from './db/connection/types';
export { createOllamaClient } from './ollama/client';
export type { OllamaClient } from './ollama/client';
export type { MemoryLogger } from './logger';
export { runConversationIncremental } from './pipeline/runConversationIncremental';
export type { IncrementalResult } from './pipeline/runConversationIncremental';
export { runConversationBackfill } from './pipeline/runConversationBackfill';
export type { BackfillResult } from './pipeline/runConversationBackfill';
export { runConversationFailedItemsRetry } from './pipeline/runConversationFailedItemsRetry';
export type { FailedItemsRetryResult } from './pipeline/runConversationFailedItemsRetry';
export { runPipelineWatchdog } from './pipeline/pipelineWatchdog';
export type { PipelineWatchdogResult } from './pipeline/pipelineWatchdog';
export { runCodeIncremental } from './pipeline/runCodeIncremental';
export type { CodeIncrementalResult } from './pipeline/runCodeIncremental';
export { runBugHistoryIncremental } from './pipeline/runBugHistoryIncremental';
export type { BugHistoryIncrementalResult } from './pipeline/runBugHistoryIncremental';
export { ingestAstFacts } from './ingest/code/astFunctionLevel';
export type { AstFactInput, AstFactStats } from './ingest/code/astFunctionLevel';
export { extractDecisionComments } from './ingest/code/extractComments';
export type { ExtractCommentsInput, ExtractCommentsStats } from './ingest/code/extractComments';
export { extractCommitRationale } from './ingest/code/extractCommitRationale';
export type { ExtractRationaleInput, ExtractRationaleStats } from './ingest/code/extractCommitRationale';
export { runReviewIncremental } from './pipeline/runReviewIncremental';
export type { ReviewIncrementalResult } from './pipeline/runReviewIncremental';
export { ingestAgentReviewResult } from './ingest/review/ingestAgentReviewResult';
export type { IngestAgentReviewResult } from './ingest/review/ingestAgentReviewResult';
export { runAgentRunWatchdog } from './ingest/review/agentRunWatchdog';
export type { AgentRunWatchdogResult } from './ingest/review/agentRunWatchdog';
export { AgentReviewInputSchema, AgentReviewFindingSchema } from './types/AgentReviewInput';
export type { AgentReviewInput, AgentReviewFinding } from './types/AgentReviewInput';

export { runSpecIncremental } from './pipeline/runSpecIncremental';
export type { SpecIncrementalResult } from './pipeline/runSpecIncremental';

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
} from './rag/ftsSync';

export { tokenizeForFts5 } from './rag/tokenizeForFts5';
export { reciprocalRankFusion } from './rag/reciprocalRankFusion';
export type { RankedItem, FusedItem, RankSource } from './rag/reciprocalRankFusion';
export { hybridSearchMemory } from './rag/hybridSearchMemory';
export type {
  HybridSearchInput,
  HybridSearchOptions,
  HybridSearchResult,
} from './rag/hybridSearchMemory';

export type { ChatMessage, ChatTurnInput, ChatChunk, ChatFilters } from './chat/types';
export { buildPrompt } from './chat/promptBuilder';
export type { BuildPromptInput, PromptSource } from './chat/promptBuilder';
export { CitationStreamParser } from './chat/citationParser';
export { ChatService } from './chat/ChatService';
export type { ChatServiceOptions } from './chat/ChatService';

export type {
  ChatProvider,
  ChatProviderChatOptions,
  ChatStreamChunk,
  EmbeddingProvider,
  HealthCheckResult,
} from './providers/types';
export { OllamaChatProvider } from './providers/ollama/OllamaChatProvider';
export type { OllamaChatProviderOptions } from './providers/ollama/OllamaChatProvider';
export { OllamaEmbeddingProvider } from './providers/ollama/OllamaEmbeddingProvider';
export type { OllamaEmbeddingProviderOptions } from './providers/ollama/OllamaEmbeddingProvider';
