import * as vscode from 'vscode';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  dispose(): void;
}

export function createLogger(name = 'Anytime Tickets'): Logger {
  const channel = vscode.window.createOutputChannel(name);
  const write = (level: string, message: string) => {
    channel.appendLine(`[${new Date().toISOString()}] [${level}] ${message}`);
  };
  return {
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message, error) => {
      write('ERROR', message);
      if (error instanceof Error && error.stack) {
        channel.appendLine(error.stack);
      } else if (error !== undefined) {
        channel.appendLine(String(error));
      }
    },
    dispose: () => channel.dispose(),
  };
}
