import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel("Anytime Database");
  return channel;
}

export const DbLogger = {
  info(msg: string): void {
    getChannel().appendLine(`[INFO] ${msg}`);
  },
  warn(msg: string): void {
    getChannel().appendLine(`[WARN] ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : "";
    getChannel().appendLine(`[ERROR] ${msg}${detail}`);
  },
  debugSql(_meta: unknown): void {
    // 通常は no-op (詳細 SQL ログは off)
  },
  dispose(): void {
    channel?.dispose();
    channel = undefined;
  },
};
