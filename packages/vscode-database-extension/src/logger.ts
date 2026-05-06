import * as vscode from "vscode";

export class AnytimeDatabaseLogger {
  private readonly channel: vscode.OutputChannel;
  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }
  private prefix(): string {
    return `[${new Date().toISOString()}]`;
  }
  info(msg: string): void {
    this.channel.appendLine(`${this.prefix()} [INFO]  ${msg}`);
  }
  warn(msg: string): void {
    this.channel.appendLine(`${this.prefix()} [WARN]  ${msg}`);
  }
  error(msg: string, err?: Error): void {
    this.channel.appendLine(
      `${this.prefix()} [ERROR] ${msg}${err?.stack ? "\n" + err.stack : ""}`,
    );
  }
  dispose(): void {
    this.channel.dispose();
  }
}
