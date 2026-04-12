import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel('Anytime Trail');
  return channel;
}

function ts(): string {
  return new Date().toISOString();
}

export const TrailLogger = {
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
  dispose(): void {
    channel?.dispose();
    channel = undefined;
  },
};
