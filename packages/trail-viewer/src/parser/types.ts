// --- Raw JSONL types (Claude Code output format) ---

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

// --- Parsed types ---

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

export interface ToolMetrics {
  readonly totalRetries: number;
  readonly totalEdits: number;
  readonly totalBuildRuns: number;
  readonly totalBuildFails: number;
  readonly totalTestRuns: number;
  readonly totalTestFails: number;
}

export interface TrailTreeNode {
  readonly message: TrailMessage;
  readonly children: readonly TrailTreeNode[];
  readonly depth: number;
}

export interface TrailFilter {
  readonly project?: string;
  readonly gitBranch?: string;
  readonly model?: string;
  readonly dateRange?: Readonly<{ from: string; to: string }>;
  readonly toolName?: string;
  readonly searchText?: string;
}

// --- v1.1: Cost Optimization ---

export interface CostOptimizationData {
  readonly actual: {
    readonly totalCost: number;
    readonly byModel: Readonly<Record<string, number>>;
  };
  readonly ruleEstimate: {
    readonly totalCost: number;
    readonly byModel: Readonly<Record<string, number>>;
  };
  readonly featureEstimate: {
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
    readonly ruleRecommended: Readonly<Record<string, number>>;
    readonly featureRecommended: Readonly<Record<string, number>>;
    readonly skillRecommended: Readonly<Record<string, number>>;
  };
}

export interface CostDailyEntry {
  readonly date: string;
  readonly actualCost: number;
  readonly ruleCost: number;
  readonly featureCost: number;
  readonly skillCost: number;
}

// --- v1.1: Prompt & Evaluation ---

export interface TrailPromptEntry {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly version: number;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrailEvaluation {
  readonly id: string;
  readonly sessionId: string;
  readonly score: number;
  readonly comment: string;
  readonly evaluator: string;
  readonly createdAt: string;
}

// --- Task (PR) types ---

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
