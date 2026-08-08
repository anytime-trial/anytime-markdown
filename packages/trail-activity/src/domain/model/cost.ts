// domain/model/cost.ts — Trail cost & pricing domain types

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface ModelPricing {
  readonly inputPerM: number;
  readonly outputPerM: number;
  readonly cacheReadMultiplier: number;
  readonly cacheCreationMultiplier: number;
}

export interface CostOptimizationData {
  readonly actual: {
    readonly totalCost: number;
    readonly byModel: Readonly<Record<string, number>>;
  };
  readonly skillEstimate: {
    readonly totalCost: number;
    readonly byModel: Readonly<Record<string, number>>;
  };
  readonly daily: readonly CostDailyEntry[];
  readonly modelDistribution: {
    readonly actual: Readonly<Record<string, number>>;
    readonly skillRecommended: Readonly<Record<string, number>>;
  };
}

export interface CostDailyEntry {
  readonly date: string;
  readonly actualCost: number;
  readonly skillCost: number;
}

// Database row types (snake_case, maps to SQLite columns)

export interface SkillModelRow {
  readonly skill: string;
  readonly canonicalSkill: string | null;
  readonly recommendedModel: string;
}

export interface SessionRow {
  readonly id: string;
  readonly slug: string;
  readonly repo_name: string;
  readonly version: string;
  readonly entrypoint: string;
  readonly model: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly file_path: string;
  readonly file_size: number;
  readonly imported_at: string;
  readonly commits_resolved_at?: string;
  readonly estimated_cost_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
  readonly peak_context_tokens?: number;
  readonly initial_context_tokens?: number;
}

export interface MessageRow {
  readonly uuid: string;
  readonly session_id: string;
  readonly parent_uuid: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly text_content: string | null;
  readonly user_content: string | null;
  readonly tool_calls: string | null;
  readonly tool_use_result: string | null;
  readonly model: string | null;
  readonly request_id: string | null;
  readonly stop_reason: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly service_tier: string | null;
  readonly speed: string | null;
  readonly timestamp: string;
  readonly is_sidechain: number;
  readonly is_meta: number;
  readonly cwd: string | null;
  readonly git_branch: string | null;
}

export interface SessionCommitRow {
  readonly session_id: string;
  readonly commit_hash: string;
  readonly commit_message: string;
  readonly author: string;
  readonly committed_at: string;
  readonly is_ai_assisted: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly repo_name: string;
}

export interface AnalyticsData {
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
    readonly totalCommits: number;
    readonly totalLinesAdded: number;
    readonly totalLinesDeleted: number;
    readonly totalFilesChanged: number;
    readonly totalAiAssistedCommits: number;
    readonly totalSessionDurationMs: number;
    readonly totalRetries: number;
    readonly totalEdits: number;
    readonly totalBuildRuns: number;
    readonly totalBuildFails: number;
    readonly totalTestRuns: number;
    readonly totalTestFails: number;
  };
  readonly toolUsage: readonly { name: string; count: number }[];
  readonly dailyActivity: readonly {
    readonly date: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
  }[];
}
