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
  readonly is_error?: boolean;
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

export interface CombinedToolCount {
  readonly period: string;
  readonly tool: string;
  readonly count: number;
  /** メッセージのトークン数をツール呼び出し数で按分した推定値 */
  readonly tokens: number;
  /** ターンの実行時間（ms）をツール呼び出し数で按分した推定値 */
  readonly durationMs: number;
}



export interface CombinedError {
  readonly period: string;
  readonly rate: number;
  readonly byTool: Readonly<Record<string, number>>;
}

export interface CombinedSkill {
  readonly period: string;
  readonly skill: string;
  readonly count: number;
  readonly costUsd: number;
}

export interface CombinedModel {
  readonly period: string;
  readonly model: string;
  readonly count: number;
  readonly tokens: number;
}


export interface CombinedCommitPrefix {
  readonly period: string;
  readonly prefix: string;
  readonly count: number;
  readonly linesAdded: number;
}

export interface CombinedAiFirstTryRate {
  readonly period: string;
  readonly rate: number;      // 0-100
  readonly sampleSize: number;
}

export interface CombinedData {
  readonly toolCounts: readonly CombinedToolCount[];
  readonly errorRate: readonly CombinedError[];
  readonly skillStats: readonly CombinedSkill[];
  readonly modelStats: readonly CombinedModel[];
  readonly commitPrefixStats: readonly CombinedCommitPrefix[];
  readonly aiFirstTryRate: readonly CombinedAiFirstTryRate[];
}

export type CombinedPeriodMode = 'day' | 'week';
export type CombinedRangeDays = 30 | 90;

// --- Domain types (re-exported from trail-core) ---

import type { TrailMessage as _TrailMessage } from '@anytime-markdown/trail-core/domain';

/** @deprecated Import from '@anytime-markdown/trail-core/domain' directly */
export type {
  TrailTokenUsage,
  TrailToolCall,
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

export type TrailMessage = _TrailMessage & {
  readonly triggerCommitHashes?: readonly string[];
  readonly agentId?: string;
  readonly agentDescription?: string;
  /** True when the tool result response to this assistant turn contained at least one is_error block */
  readonly hasToolError?: boolean;
  /** True when this assistant turn ran a git commit bash command */
  readonly hasCommit?: boolean;
  /** Tool execution time in ms (nextUserMsg.timestamp - assistantMsg.timestamp) */
  readonly toolExecMs?: number;
};
