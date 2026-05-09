/**
 * Supabase trail テーブルの DB 行型。
 * data 層の入力（SQL 結果）を表現する。domain 層からは参照禁止。
 */

export interface SessionCostDbRow {
  readonly session_id: string;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly estimated_cost_usd: number;
}

export interface SessionDbRow {
  readonly id: string;
  readonly slug: string;
  readonly repo_name: string;
  readonly model: string;
  readonly version: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly peak_context_tokens: number | null;
  readonly initial_context_tokens: number | null;
  readonly interruption_reason: string | null;
  readonly interruption_context_tokens: number | null;
  readonly compact_count: number | null;
  readonly sub_agent_count: number | null;
  readonly error_count: number | null;
  readonly assistant_message_count: number | null;
  readonly file_path?: string | null;
  readonly source?: 'claude_code' | 'codex' | null;
  readonly trail_session_costs?: readonly SessionCostDbRow[];
}

export interface MessageDbRow {
  readonly uuid: string;
  readonly parent_uuid: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly text_content: string | null;
  readonly user_content: string | null;
  readonly tool_calls: string | null;
  readonly model: string | null;
  readonly stop_reason: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly timestamp: string;
  readonly is_sidechain: number;
  readonly agent_id?: string | null;
  readonly agent_description?: string | null;
  readonly source_tool_assistant_uuid?: string | null;
}

export interface CommitDbRow {
  readonly repo_name?: string | null;
  readonly commit_hash: string;
  readonly commit_message: string;
  readonly author: string;
  readonly committed_at: string;
  readonly is_ai_assisted: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
}

// ---------------------------------------------------------------------------
//  Memory API response types (mirrored from MemoryApiHandler in vscode-trail-extension)
// ---------------------------------------------------------------------------

export interface MemoryDriftEventRow {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly subjectDisplayName: string;
  readonly predicate: string;
  readonly driftType: string;
  readonly severity: string;
  readonly conversationValue: string | null;
  readonly specValue: string | null;
  readonly codeValue: string | null;
  readonly detectedAt: string;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string;
}

export interface MemoryDriftEventDetail extends MemoryDriftEventRow {
  readonly detailJson: unknown;
}

export interface MemoryRecurringBugRow {
  readonly id: string;
  readonly subjectEntityId: string;
  readonly subjectDisplayName: string;
  readonly driftType: string;
  readonly severity: string;
  readonly detectedAt: string;
}

export interface MemoryBugHistoryRow {
  readonly id: string;
  readonly commitSha: string;
  readonly bugEntityId: string;
  readonly package: string;
  readonly category: string;
  readonly subjectSummary: string;
  readonly committedAt: string;
}

export interface MemoryUnaddressedReviewFindingRow {
  readonly id: string;
  readonly reviewId: string;
  readonly targetFilePath: string | null;
  readonly category: string;
  readonly severity: string;
  readonly findingText: string;
  readonly recordedAt: string;
}

export interface MemoryReviewHistoryRow {
  readonly id: string;
  readonly reviewId: string;
  readonly title: string;
  readonly reviewedAt: string;
  readonly targetFilePath: string | null;
  readonly category: string;
  readonly severity: string;
  readonly findingText: string;
  readonly addressedCommitSha: string | null;
  readonly addressedAt: string | null;
}

export interface MemoryPipelineRunRow {
  readonly id: string;
  readonly scope: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: string;
  readonly itemsProcessed: number;
  readonly errorMessage: string | null;
}

export interface MemoryFailedItemRow {
  readonly scope: string;
  readonly itemKey: string;
  readonly failedAt: string;
  readonly reason: string;
  readonly attemptCount: number;
}

export interface MemoryTopEntityRow {
  readonly id: string;
  readonly type: string;
  readonly canonicalName: string;
  readonly displayName: string;
  readonly lastUpdatedAt: string;
}

export interface MemoryInvalidationRow {
  readonly id: string;
  readonly edgeId: string;
  readonly invalidatedAt: string;
  readonly reason: string;
  readonly supersedingEdgeId: string | null;
}
