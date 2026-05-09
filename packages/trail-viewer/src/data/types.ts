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
