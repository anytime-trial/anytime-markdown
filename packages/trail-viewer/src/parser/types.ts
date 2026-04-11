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
  TrailTask,
  TrailTaskFile,
  TrailTaskC4Element,
  TrailTaskFeature,
} from '@anytime-markdown/trail-core/domain';
