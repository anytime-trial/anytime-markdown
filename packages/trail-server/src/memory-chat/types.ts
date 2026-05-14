/**
 * memory-chat 内部の最小ロガー契約。
 *
 * 外部呼び出し側 (vscode-trail-extension/src/extension.ts や trail-server/src/cli.ts) が
 * `{ info, error }` だけのアドホックオブジェクトを渡してくるため、
 * ここでは runtime/Logger.ts の Logger インタフェースには寄せず、
 * info / error のみ要求する。
 */
export interface MemoryChatLogger {
  info(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, err?: unknown): void;
}
