// DB 読み取り / 取得専用の公開面 (typescript 非汚染)。
//
// なぜ別 barrel か:
// root の `index.ts` は ingest/pipeline (runCodeIncremental / extractDecisionComments) を
// re-export しており、`sideEffects` 設定によらず webpack がこれらを tree-shake できず
// `typescript` (9MB) を巻き込む。mcp-trail のような thin client はここ (`/query`) から
// import することで ts 非依存の `retrieve/` `db/` `logger` だけを取り込む。
//
// 含めてよいのは ts を transitively 引かないモジュール (`retrieve/*` `db/*` `logger`) のみ。
// pipeline / ingest 由来のシンボルは絶対に re-export しないこと。

// DB / logger
export { openMemoryCoreDb } from '../db/connection';
export type { MemoryCoreDb, OpenMemoryCoreDbOptions } from '../db/connection';
export { noopLogger } from '../logger';
export type { MemoryLogger } from '../logger';

// 検索
export { searchMemory, vectorTopK } from '../retrieve/searchMemory';
export type { SearchInput, SearchResult, SearchEntity, SearchEdge, SearchEpisode } from '../retrieve/searchMemory';

// バグ履歴
export { listRecurringBugs } from '../retrieve/listRecurringBugs';
export type { RecurringBugGroup, BugFixSummary } from '../retrieve/listRecurringBugs';
export { getBugHistory } from '../retrieve/getBugHistory';
export type { BugHistoryEntry, CausedByRef } from '../retrieve/getBugHistory';

// レビュー
export { listUnaddressedReviewFindings } from '../retrieve/listUnaddressedReviewFindings';
export type { UnaddressedReviewFinding } from '../retrieve/listUnaddressedReviewFindings';
export { getReviewHistory } from '../retrieve/getReviewHistory';
export type { ReviewHistoryEntry, ReviewFindingSummary } from '../retrieve/getReviewHistory';
export { linkReviewToCommit } from '../retrieve/linkReviewToCommit';
export type { LinkReviewToCommitResult } from '../retrieve/linkReviewToCommit';
export { runReviewAgent } from '../retrieve/runReviewAgent';
export type { RunReviewAgentResult } from '../retrieve/runReviewAgent';
export { getReviewRunStatus } from '../retrieve/getReviewRunStatus';
export type { ReviewRunStatus } from '../retrieve/getReviewRunStatus';
export { listReviewRuns } from '../retrieve/listReviewRuns';
export { listReviewTargetHints } from '../retrieve/listReviewTargetHints';
export type { ReviewTargetHint } from '../retrieve/listReviewTargetHints';

// ドリフト
export { detectDrift } from '../retrieve/detectDrift';
export type { DriftEventSummary, DetectDriftInput } from '../retrieve/detectDrift';
export { explainDrift } from '../retrieve/explainDrift';
export type { ExplainDriftResult, DriftSourceEvidence } from '../retrieve/explainDrift';
export { resolveDrift } from '../retrieve/resolveDrift';
export type { ResolveDriftResult } from '../retrieve/resolveDrift';
