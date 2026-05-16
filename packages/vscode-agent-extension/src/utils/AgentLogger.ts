import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  _channel ??= vscode.window.createOutputChannel('Anytime Agent');
  return _channel;
}

function ts(): string {
  return new Date().toISOString();
}

export const AgentLogger = {
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
    _channel?.dispose();
    _channel = undefined;
  },
};
