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

export interface MultiAgentActivityMessage {
  readonly type: 'multi-agent-activity-updated';
  readonly agents: readonly AgentActivityEntry[];
}

export type ServerMessage = DsmUpdatedMessage | AnalysisProgressMessage | DocLinksUpdatedMessage | ImportanceUpdatedMessage | ClaudeActivityUpdatedMessage | MultiAgentActivityMessage;

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

export type ClientMessage =
  | SetLevelCommand
  | ClusterCommand
  | RefreshCommand
  | OpenDocLinkCommand
  | ResetClaudeActivityCommand;
