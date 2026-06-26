/** vscode.Disposable の汎用代替 */
export interface Disposable {
  dispose(): void;
}

/** セッション内で編集されたファイルの記録 */
export interface SessionEdit {
  readonly file: string;
  /** UTC ISO 8601 (例: "2026-04-16T11:28:59.778Z") */
  readonly timestamp: string;
}

export interface ClaudeStatus {
  readonly editing: boolean;
  readonly file: string;
  /** UTC ISO 8601 (例: "2026-04-16T11:28:59.778Z") */
  readonly timestamp: string;
  /** Claude Code のセッション ID */
  readonly sessionId?: string;
  /** セッション内で編集したファイルの累積履歴 */
  readonly sessionEdits?: readonly SessionEdit[];
  /** プランファイルから抽出した計画対象ファイルの絶対パス配列 */
  readonly plannedEdits?: readonly string[];
  /** 現在の git ブランチ名 */
  readonly branch?: string;
  /** Bash ツール実行時の cwd（worktree 内でのテスト実行検出に使用） */
  readonly workspacePath?: string;
}

/** セッションの最新コミット要約 */
export interface AgentLastCommit {
  readonly hash: string;
  /** UTC ISO 8601 */
  readonly timestamp: string;
}

/**
 * セッションの出自。`'claude'` は agent-status worker DB（フック経由）、
 * `'codex'` は Codex rollout `.jsonl` の読み取り専用スキャン。変換漏れを Claude 扱いで
 * 隠さないよう必須にする。
 *
 * NOTE: agent-core `src/mapping/types.ts` の AgentSource と同内容のローカルミラー。
 * vscode-common は agent-core の CJS バレル（node:sqlite 含む）を import しないため複製している。
 * 値を追加・削除するときは **両方同時に更新** すること（codex/parseCodexRollout.ts のミラー注記と同じ理由）。
 */
export type AgentSource = 'claude' | 'codex';

/** マルチエージェント監視で使用するエージェント情報 */
export interface AgentInfo {
  readonly sessionId: string;
  readonly source: AgentSource;
  readonly editing: boolean;
  readonly file: string;
  readonly timestamp: string;
  readonly branch: string;
  readonly sessionEdits: readonly SessionEdit[];
  readonly plannedEdits: readonly string[];
  /** JSONL の ai-title エントリから取得したセッションタイトル */
  readonly sessionTitle?: string;
  /** Bash ツール実行時の cwd（worktree 内でのテスト実行検出に使用） */
  readonly workspacePath?: string;
  /** JSONL の最新 assistant.message.usage から算出したコンテキストトークン数 */
  readonly contextTokens?: number;
  /** そのセッションのコミット累計（agent-status DB 由来） */
  readonly committedCount?: number;
  /** 最新コミットのハッシュ・時刻（agent-status DB 由来） */
  readonly lastCommit?: AgentLastCommit;
}

export interface TodayStats {
  readonly sessionCount: number;
  readonly totalTokens: number;
}

export type StatusChangeCallback = (editing: boolean, filePath: string) => void;
export type MultiStatusChangeCallback = (agents: ReadonlyMap<string, AgentInfo>) => void;

/** agent-status ワーカーの 1 行（AgentStatusClient.queryAll が返す形）の最小契約。 */
export interface AgentStatusRow {
  readonly sessionId: string;
  readonly editing: boolean;
  readonly file: string;
  readonly branch: string;
  readonly workspacePath: string;
  readonly sessionEdits: readonly SessionEdit[];
  readonly plannedEdits: readonly string[];
  readonly committedCount: number;
  readonly lastCommit: AgentLastCommit | null;
  readonly updatedAt: string;
}

/**
 * ClaudeStatusWatcher に注入するデータ源。agent-core の AgentStatusClient が満たす契約だが、
 * vscode-common は node:sqlite を含む agent-core を import しないため、この interface だけに依存する。
 */
export interface AgentStatusSource {
  queryAll(): Promise<readonly AgentStatusRow[]>;
  deleteSession(sessionId: string): Promise<boolean>;
}
