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
}

export type StatusChangeCallback = (editing: boolean, filePath: string) => void;
