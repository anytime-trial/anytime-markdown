// --- Raw JSONL types (Claude Code output format) ---
// These are trail-viewer specific (JSONL parsing) and remain here.

export interface RawJsonlMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly uuid?: string;
  readonly parentUuid?: string | null;
  readonly isSidechain?: boolean;
  readonly timestamp?: string;
  readonly sessionId?: string;
  readonly version?: string;
  readonly gitBranch?: string;
  readonly cwd?: string;
  readonly slug?: string;
  readonly message?: {
    readonly role?: string;
    readonly model?: string;
    readonly content?: string | readonly RawContentBlock[];
    readonly usage?: RawUsage;
    readonly stop_reason?: string | null;
  };
  readonly userContent?: string;
  readonly isMeta?: boolean;
}

export interface RawContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: Record<string, unknown>;
  readonly content?: string | readonly RawContentBlock[];
}

export interface RawUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

// --- Analytics types ---

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
  readonly modelBreakdown: readonly {
    readonly model: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly estimatedCostUsd: number;
  }[];
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

export interface BehaviorToolSequence {
  readonly period: string;
  readonly sequence: string;
  readonly count: number;
}

export interface BehaviorToolCount {
  readonly period: string;
  readonly tool: string;
  readonly count: number;
  /** メッセージのトークン数をツール呼び出し数で按分した推定値 */
  readonly tokens: number;
  /** ターンの実行時間（ms）をツール呼び出し数で按分した推定値 */
  readonly durationMs: number;
}



export interface BehaviorSubagent {
  readonly period: string;
  readonly rate: number;
  readonly byType: Readonly<Record<string, number>>;
}

export interface BehaviorError {
  readonly period: string;
  readonly rate: number;
  readonly byTool: Readonly<Record<string, number>>;
}

export interface BehaviorSkill {
  readonly period: string;
  readonly skill: string;
  readonly count: number;
  readonly costUsd: number;
}

export interface BehaviorCacheSession {
  readonly period: string;
  readonly hitRate: number;
  readonly isAnomaly: boolean;
}

export interface BehaviorCorrection {
  readonly period: string;
  readonly count: number;
  readonly preTool: Readonly<Record<string, number>>;
}

export interface BehaviorData {
  readonly toolSequences: readonly BehaviorToolSequence[];
  readonly toolCounts: readonly BehaviorToolCount[];
  readonly subagentRate: readonly BehaviorSubagent[];
  readonly errorRate: readonly BehaviorError[];
  readonly skillStats: readonly BehaviorSkill[];
  readonly cacheEfficiency: readonly BehaviorCacheSession[];
  readonly corrections: readonly BehaviorCorrection[];
}

export type BehaviorPeriodMode = 'day' | 'week' | 'session';
export type BehaviorRangeDays = 30 | 90 | 180;

// --- Domain types (re-exported from trail-core) ---

/** @deprecated Import from '@anytime-markdown/trail-core/domain' directly */
export type {
  TrailTokenUsage,
  TrailToolCall,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
  ToolMetrics,
  TrailTreeNode,
  TrailFilter,
  CostOptimizationData,
  CostDailyEntry,
  TrailPromptEntry,
  TrailEvaluation,
} from '@anytime-markdown/trail-core/domain';
