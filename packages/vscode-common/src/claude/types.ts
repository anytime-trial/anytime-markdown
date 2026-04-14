/** vscode.Disposable の汎用代替 */
export interface Disposable {
  dispose(): void;
}

export interface ClaudeStatus {
  readonly editing: boolean;
  readonly file: string;
  readonly timestamp: number;
}

export type StatusChangeCallback = (editing: boolean, filePath: string) => void;
