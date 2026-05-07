import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel("Anytime Database");
  return channel;
}

function ts(): string {
  return new Date().toISOString();
}

export const DbLogger = {
  info(msg: string): void {
    getChannel().appendLine(`[${ts()}] [INFO] ${msg}`);
  },
  warn(msg: string): void {
    getChannel().appendLine(`[${ts()}] [WARN] ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    const detail =
      err instanceof Error
        ? `\n${err.stack ?? err.message}`
        : err !== undefined
          ? `: ${String(err)}`
          : "";
    getChannel().appendLine(`[${ts()}] [ERROR] ${msg}${detail}`);
  },
  debugSql(_meta: unknown): void {
    // 通常は no-op (詳細 SQL ログは off)
  },
  dispose(): void {
    channel?.dispose();
    channel = undefined;
  },
};
