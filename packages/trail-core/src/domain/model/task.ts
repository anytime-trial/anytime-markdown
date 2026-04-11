// domain/model/task.ts — Trail task (PR/merge) domain types

export interface TrailTask {
  readonly id: string;
  readonly mergeCommitHash: string;
  readonly branchName: string | null;
  readonly prNumber: number | null;
  readonly title: string;
  readonly mergedAt: string;
  readonly baseBranch: string;
  readonly commitCount: number;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly sessionCount: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalDurationMs: number;
  readonly resolvedAt: string | null;
  readonly files?: readonly TrailTaskFile[];
  readonly c4Elements?: readonly TrailTaskC4Element[];
  readonly features?: readonly TrailTaskFeature[];
}

export interface TrailTaskFile {
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly changeType: string;
}

export interface TrailTaskC4Element {
  readonly elementId: string;
  readonly elementType: string;
  readonly elementName: string;
  readonly matchType: string;
}

export interface TrailTaskFeature {
  readonly featureId: string;
  readonly featureName: string;
  readonly role: string;
}

// Database row types (snake_case, maps to SQLite columns)

export interface TaskRow {
  readonly id: string;
  readonly merge_commit_hash: string;
  readonly branch_name: string | null;
  readonly pr_number: number | null;
  readonly title: string;
  readonly merged_at: string;
  readonly base_branch: string;
  readonly commit_count: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly session_count: number;
  readonly total_input_tokens: number;
  readonly total_output_tokens: number;
  readonly total_cache_read_tokens: number;
  readonly total_duration_ms: number;
  readonly resolved_at: string | null;
}

export interface TaskFileRow {
  readonly task_id: string;
  readonly file_path: string;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly change_type: string;
}

export interface TaskC4ElementRow {
  readonly task_id: string;
  readonly element_id: string;
  readonly element_type: string;
  readonly element_name: string;
  readonly match_type: string;
}

export interface TaskFeatureRow {
  readonly task_id: string;
  readonly feature_id: string;
  readonly feature_name: string;
  readonly role: string;
}
