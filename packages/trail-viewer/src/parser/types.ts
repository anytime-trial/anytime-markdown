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
  readonly usage: TrailTokenUsage;
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
