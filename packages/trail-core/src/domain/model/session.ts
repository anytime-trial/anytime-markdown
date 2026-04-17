// domain/model/session.ts — Trail session domain types

export interface TrailTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface TrailToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly result?: string;
}

export interface TrailMessage {
  readonly uuid: string;
  readonly parentUuid: string | null;
  readonly type: 'user' | 'assistant' | 'system';
  readonly subtype?: string;
  readonly timestamp: string;
  readonly isSidechain: boolean;
  readonly model?: string;
  readonly toolCalls?: readonly TrailToolCall[];
  readonly textContent?: string;
  readonly usage?: TrailTokenUsage;
  readonly stopReason?: string | null;
  readonly userContent?: string;
}

export interface TrailSession {
  readonly id: string;
  readonly slug: string;
  readonly project: string;
  readonly gitBranch: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly version: string;
  readonly model: string;
  readonly messageCount: number;
  readonly peakContextTokens?: number;
  readonly initialContextTokens?: number;
  readonly commitStats?: {
    readonly commits: number;
    readonly linesAdded: number;
    readonly linesDeleted: number;
    readonly filesChanged: number;
  };
  readonly interruption?: {
    readonly interrupted: boolean;
    readonly reason: 'max_tokens' | 'no_response' | null;
    readonly contextTokens: number;
  };
  readonly usage: TrailTokenUsage;
  readonly estimatedCostUsd?: number;
}

export interface TrailSessionCommit {
  readonly commitHash: string;
  readonly commitMessage: string;
  readonly author: string;
  readonly committedAt: string;
  readonly isAiAssisted: boolean;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

export interface ToolUsageEntry {
  readonly tool: string;
  readonly count: number;
  readonly tokens: number;
  readonly durationMs: number;
}

export interface SkillUsageEntry {
  readonly skill: string;
  readonly count: number;
  readonly tokens: number;
  readonly durationMs: number;
}

export interface ErrorEntry {
  readonly tool: string;
  readonly count: number;
}

export interface ModelUsageEntry {
  readonly model: string;
  readonly count: number;
  readonly tokens: number;
  readonly durationMs: number;
}

export interface ToolMetrics {
  readonly totalRetries: number;
  readonly totalEdits: number;
  readonly totalBuildRuns: number;
  readonly totalBuildFails: number;
  readonly totalTestRuns: number;
  readonly totalTestFails: number;
  /** セッション内のツール別利用統計 */
  readonly toolUsage?: readonly ToolUsageEntry[];
  /** セッション内のスキル別利用統計 */
  readonly skillUsage?: readonly SkillUsageEntry[];
  /** セッション内のツール別エラー回数 */
  readonly errorsByTool?: readonly ErrorEntry[];
  /** セッション内のモデル別利用統計 */
  readonly modelUsage?: readonly ModelUsageEntry[];
}

export interface TrailTreeNode {
  readonly message: TrailMessage;
  readonly children: readonly TrailTreeNode[];
  readonly depth: number;
}
