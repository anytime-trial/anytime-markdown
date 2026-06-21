import * as vscode from 'vscode';

/**
 * 拡張の OutputChannel 経由のログ出力。CLAUDE.md のログ規約に従う:
 * - `vscode.OutputChannel` 経由（`console.*` はユーザーから見えないため使わない）
 * - 各行先頭に UTC ISO 8601 時刻
 * - `error` は `Error.stack` を含める
 *
 * `init(channel)` で activate() が生成済みの 'Anytime Markdown' チャンネルを共有する。
 * 未 init の場合は遅延生成にフォールバックする。
 */
let _channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  _channel ??= vscode.window.createOutputChannel('Anytime Markdown');
  return _channel;
}

function ts(): string {
  return new Date().toISOString();
}

export const MarkdownLogger = {
  /** activate() で生成済みの OutputChannel を共有する。 */
  init(channel: vscode.OutputChannel): void {
    _channel = channel;
  },

  info(msg: string): void {
    getChannel().appendLine(`[${ts()}] [INFO] ${msg}`);
  },

  warn(msg: string): void {
    getChannel().appendLine(`[${ts()}] [WARN] ${msg}`);
  },

  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : '';
    getChannel().appendLine(`[${ts()}] [ERROR] ${msg}${detail}`);
    if (err instanceof Error && err.stack) {
      getChannel().appendLine(err.stack);
    }
  },
};
