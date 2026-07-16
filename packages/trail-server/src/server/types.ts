import type {
  DocLink,
  DsmMatrix,
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

export interface ProviderStatusMessage {
  readonly type: 'provider.status';
  readonly status: 'ready' | 'unavailable' | 'unknown';
  readonly detail?: string;
}

export interface ChatChunkMessage {
  readonly type: 'chat.chunk';
  readonly chunk: unknown;
}

export type ServerMessage =
  | DsmUpdatedMessage
  | AnalysisProgressMessage
  | DocLinksUpdatedMessage
  | ClaudeActivityUpdatedMessage
  | MultiAgentActivityMessage
  | TokenBudgetUpdatedMessage
  | ModelUpdatedMessage
  | CodeGraphUpdatedMessage
  | CodeGraphProgressMessage
  | ProviderStatusMessage
  | ChatChunkMessage;

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

export interface OpenFileCommand {
  readonly type: 'open-file';
  readonly filePath: string;
}

/**
 * Standalone Viewer 側の初回描画・lazy chunk 読込時間などを extension に
 * 送信するための perf 計測メッセージ。受信側 (TrailDataServer) は
 * TrailLogger.debugPerf に流し、TRAIL_DEBUG_PERF=1 の時のみ OutputChannel に出力する。
 */
export interface PerfReportCommand {
  readonly type: 'perf-report';
  readonly metric: string;
  readonly ms: number;
  readonly meta?: Record<string, unknown>;
}

export interface ChatSendCommand {
  readonly type: 'chat.send';
  readonly query: string;
}

export interface ChatAbortCommand {
  readonly type: 'chat.abort';
}

export interface ProviderRecheckCommand {
  readonly type: 'provider.recheck';
}

/** グラフ要素を Agent Note の新規ページへ出力する（trail-viewer 右クリック → agent 拡張連携） */
export interface AddNotePageCommand {
  readonly type: 'add-note-page';
  readonly title: string;
  readonly contextMarkdown: string;
  readonly imageDataUrl?: string;
}

export type ClientMessage =
  | SetLevelCommand
  | ClusterCommand
  | RefreshCommand
  | OpenDocLinkCommand
  | ResetClaudeActivityCommand
  | GenerateCodeGraphCommand
  | OpenFileCommand
  | PerfReportCommand
  | ChatSendCommand
  | ChatAbortCommand
  | ProviderRecheckCommand
  | AddNotePageCommand;
