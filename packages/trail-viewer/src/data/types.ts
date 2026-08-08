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
  /** 出所ワークスペース（repo_name）。'' は未解決。 */
  readonly workspace: string;
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
  readonly sessionId: string | null;
  /**
   * このバグを潰したセッションが属する指示 ID。宣言があればその指示 ID、無ければセッション ID
   * （Review タブの `MemoryFlightReviewFindingRow.instructionId` と同じ暗黙グループの規則）。
   * セッション不明のバグ、または trail.db を引けない構成では null。
   */
  readonly instructionId: string | null;
  readonly committedAt: string;
  readonly precededByFindingIds: readonly string[];
  /** 取込元リポジトリ（repo_name）。'' は未解決。 */
  readonly workspace: string;
}

export interface MemoryBugCausalInfo {
  readonly bugEntityId: string;
  readonly subject: string;
  readonly category: string;
  readonly commitSha: string;
  readonly committedAt: string;
  readonly affectedFilePaths: readonly string[];
  readonly rootCauses: readonly { readonly entityId: string; readonly displayName: string }[];
  readonly siblingBugEntityIds: readonly string[];
  readonly precedingFindings: readonly {
    readonly findingEntityId: string;
    readonly targetFilePath: string | null;
    readonly severity: string;
  }[];
  readonly introducedByCommitSha: string | null;
  readonly introducedByCommitSubject: string | null;
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
  readonly findingEntityId: string;
  readonly title: string;
  readonly reviewer: string;
  readonly sourceKind: string;
  readonly model: string | null;
  readonly sessionId: string | null;
  readonly reviewedAt: string;
  /** レビューが行われたワークスペース（repo_name）。'' は未解決。 */
  readonly workspace: string;
  readonly targetFilePath: string | null;
  /** 実在検査で解決した指摘対象のリポジトリ。null は未解決。 */
  readonly targetRepo: string | null;
  readonly category: string;
  readonly severity: string;
  readonly findingText: string;
  readonly addressedCommitSha: string | null;
  readonly addressedAt: string | null;
  readonly precedesBugEntityIds: readonly string[];
}

/**
 * Flight Record（指示単位）へ畳んだレビュー指摘 1 件。
 * `instructionId` は明示宣言があればその指示 ID、無ければセッション ID（暗黙グループ）。
 */
export interface MemoryFlightReviewFindingRow {
  readonly id: string;
  /** `precedes` エッジ（バグ → 事前指摘）が指すキー。行 id とは別物。 */
  readonly findingEntityId: string;
  readonly reviewId: string;
  readonly instructionId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly workspace: string;
  readonly targetFilePath: string | null;
  readonly targetRepo: string | null;
  readonly category: string;
  readonly severity: string;
  readonly findingText: string;
  readonly addressedCommitSha: string | null;
  readonly addressedAt: string | null;
}

/** 指示単位の指摘件数（SQL 集計。一覧の limit で欠けない）。 */
export interface MemoryFlightReviewFindingCountRow {
  readonly instructionId: string;
  readonly error: number;
  readonly warn: number;
  readonly info: number;
  readonly total: number;
}

export type MemoryPipelineRunStatus = 'error' | 'partial' | 'success' | 'running';

export interface MemoryPipelineRunStatsByDayRow {
  readonly day: string;
  readonly scope: string;
  readonly wave: string;
  readonly runs: number;
  readonly durationSec: number;
  readonly itemsProcessed: number;
  readonly worstStatus: MemoryPipelineRunStatus;
}

export interface MemoryPipelineRunRow {
  readonly id: string;
  readonly scope: string;
  readonly wave: string;
  readonly tier: number;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number;
  readonly itemsProcessed: number;
  readonly itemsFailed: number;
  readonly errorDetail: string;
}

export interface MemoryPipelineRunLogRow {
  readonly id: number;
  readonly timestamp: string;
  readonly level: string;
  readonly source: string;
  readonly component: string;
  readonly message: string;
  readonly metadata: string | null;
  readonly stack: string | null;
}

export interface MemoryFailedItemRow {
  readonly scope: string;
  readonly itemKey: string;
  readonly failedAt: string;
  readonly reason: string;
  readonly detail: string;
  readonly attemptCount: number;
}

export interface MemoryInvalidationRow {
  readonly id: string;
  readonly edgeId: string;
  readonly invalidatedAt: string;
  readonly reason: string;
  readonly supersedingEdgeId: string | null;
}
