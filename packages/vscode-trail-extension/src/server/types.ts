import type {
  DocLink,
  DsmMatrix,
  ImportanceMatrix,
} from '@anytime-markdown/trail-core/c4';

// ---------------------------------------------------------------------------
//  Server → Client messages
// ---------------------------------------------------------------------------

export interface DsmUpdatedMessage {
  readonly type: 'dsm-updated';
  readonly matrix: DsmMatrix;
}

export interface AnalysisProgressMessage {
  readonly type: 'analysis-progress';
  /** 現在のフェーズ名（空文字で完了/非表示） */
  readonly phase: string;
  /** 0〜100 の進捗率（不明な場合は -1） */
  readonly percent: number;
}

export interface DocLinksUpdatedMessage {
  readonly type: 'doc-links-updated';
  readonly docLinks: readonly DocLink[];
}

export interface ImportanceUpdatedMessage {
  readonly type: 'importance-updated';
  readonly importanceMatrix: ImportanceMatrix;
}

export interface ClaudeActivityUpdatedMessage {
  readonly type: 'claude-activity-updated';
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface AgentActivityEntry {
  readonly sessionId: string;
  readonly label: string;
  readonly branch: string;
  readonly currentFile: string;
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface FileConflict {
  /** 衝突ファイルの絶対パス */
  readonly file: string;
  /** 対応する C4 要素 ID */
  readonly elementIds: readonly string[];
  /** 関与するエージェントのセッション ID */
  readonly agentSessionIds: readonly string[];
  /** true: 同時 editing、false: sessionEdits の重複のみ */
  readonly isActiveConflict: boolean;
}

export interface MultiAgentActivityMessage {
  readonly type: 'multi-agent-activity-updated';
  readonly agents: readonly AgentActivityEntry[];
  readonly conflicts: readonly FileConflict[];
}

export interface TokenBudgetUpdatedMessage {
  readonly type: 'token-budget-updated';
  readonly sessionId: string;
  readonly sessionTokens: number;
  readonly dailyTokens: number;
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
  readonly turnCount: number;
  readonly messageCount: number;
}

export interface ModelUpdatedMessage { readonly type: 'model-updated'; }

export interface CodeGraphUpdatedMessage {
  readonly type: 'code-graph-updated';
}

export interface CodeGraphProgressMessage {
  readonly type: 'code-graph-progress';
  readonly phase: string;
  readonly percent: number;
}

export type ServerMessage = DsmUpdatedMessage | AnalysisProgressMessage | DocLinksUpdatedMessage | ImportanceUpdatedMessage | ClaudeActivityUpdatedMessage | MultiAgentActivityMessage | TokenBudgetUpdatedMessage | ModelUpdatedMessage | CodeGraphUpdatedMessage | CodeGraphProgressMessage;

// ---------------------------------------------------------------------------
//  Client → Server messages
// ---------------------------------------------------------------------------

export interface SetLevelCommand {
  readonly type: 'set-level';
  readonly level: 'component' | 'package';
}

export interface ClusterCommand {
  readonly type: 'cluster';
  readonly enabled: boolean;
}

export interface RefreshCommand {
  readonly type: 'refresh';
}

export interface OpenDocLinkCommand {
  readonly type: 'open-doc-link';
  readonly path: string;
}

export interface ResetClaudeActivityCommand {
  readonly type: 'reset-claude-activity';
}

export interface GenerateCodeGraphCommand {
  readonly type: 'generate-code-graph';
}

export type ClientMessage =
  | SetLevelCommand
  | ClusterCommand
  | RefreshCommand
  | OpenDocLinkCommand
  | ResetClaudeActivityCommand
  | GenerateCodeGraphCommand;
