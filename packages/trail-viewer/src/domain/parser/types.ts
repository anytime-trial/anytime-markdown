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
    /** Current total lines of code from coverage data */
    readonly totalLoc: number;
    /** Optional comparison data for deltas */
    readonly comparison?: {
      readonly sessions?: { readonly deltaPct: number | null };
      readonly tokens?: { readonly deltaPct: number | null };
      readonly cost?: { readonly deltaPct: number | null };
      readonly commits?: { readonly deltaPct: number | null };
      readonly loc?: { readonly deltaPct: number | null };
    };
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
    readonly commits: number;
    readonly linesAdded: number;
    readonly linesDeleted: number;
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
  /** トークン欠損ターン比率 (0–1)。欠損がない場合は 0 */
  readonly tokenMissingRate: number;
  readonly tokenTotalTurns: number;
  readonly tokenMissingTurns: number;
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
  readonly tokenMissingRate: number;
  readonly tokenTotalTurns: number;
  readonly tokenMissingTurns: number;
}

export interface CombinedAgent {
  readonly period: string;
  readonly agent: string;
  readonly tokens: number;
  readonly costUsd: number;
  readonly loc: number;
  readonly tokenMissingRate: number;
  readonly tokenTotalTurns: number;
  readonly tokenMissingTurns: number;
}


export interface CombinedCommitPrefix {
  readonly period: string;
  readonly prefix: string;
  readonly count: number;
  readonly linesAdded: number;
}

export interface CombinedRepository {
  readonly period: string;
  readonly repoName: string;
  readonly count: number;
  readonly tokens: number;
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
  readonly agentStats: readonly CombinedAgent[];
  readonly commitPrefixStats: readonly CombinedCommitPrefix[];
  readonly aiFirstTryRate: readonly CombinedAiFirstTryRate[];
  readonly repoStats: readonly CombinedRepository[];
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
  readonly codexSessionId?: string;
  /** True when the tool result response to this assistant turn contained at least one is_error block */
  readonly hasToolError?: boolean;
  /** True when this assistant turn ran a git commit bash command */
  readonly hasCommit?: boolean;
  /** Tool execution time in ms (nextUserMsg.timestamp - assistantMsg.timestamp) */
  readonly toolExecMs?: number;
  /** Skill invoked for this turn (from messages.skill) */
  readonly skill?: string;
};
