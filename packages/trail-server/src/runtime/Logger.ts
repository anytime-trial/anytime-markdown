import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10, info: 20, warn: 30, error: 40,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR',
};

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
  dispose?(): void;
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta) return '';
  return ' ' + Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
}

function formatLine(
  level: LogLevel,
  scope: string | undefined,
  msg: string,
  meta?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const scopeStr = scope ? ` [${scope}]` : '';
  return `[${ts}] [${LEVEL_LABEL[level]}]${scopeStr} ${msg}${formatMeta(meta)}\n`;
}

abstract class BaseLogger implements Logger {
  constructor(protected level: LogLevel, protected scope?: string) {}

  protected shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  protected abstract emit(line: string): void;

  debug(msg: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) this.emit(formatLine('debug', this.scope, msg, meta));
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) this.emit(formatLine('info', this.scope, msg, meta));
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) this.emit(formatLine('warn', this.scope, msg, meta));
  }
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    let line = formatLine('error', this.scope, msg, meta);
    if (err instanceof Error && err.stack) line += err.stack + '\n';
    else if (err !== undefined) line += String(err) + '\n';
    this.emit(line);
  }

  abstract child(scope: string): Logger;
}

export class ConsoleLogger extends BaseLogger {
  protected emit(line: string): void {
    process.stdout.write(line);
  }
  child(scope: string): Logger {
    const childScope = this.scope ? `${this.scope}/${scope}` : scope;
    return new ConsoleLogger(this.level, childScope);
  }
}

export class FileLogger extends BaseLogger {
  private readonly fd: number;
  constructor(private readonly path: string, level: LogLevel, scope?: string) {
    super(level, scope);
    mkdirSync(dirname(path), { recursive: true });
    this.fd = openSync(path, 'a');
  }
  protected emit(line: string): void {
    writeSync(this.fd, line);
  }
  dispose(): void {
    try { closeSync(this.fd); } catch { /* already closed */ }
  }
  child(scope: string): Logger {
    const childScope = this.scope ? `${this.scope}/${scope}` : scope;
    const child = Object.create(FileLogger.prototype) as FileLogger;
    Object.assign(child, { fd: this.fd, level: this.level, scope: childScope, path: this.path });
    return child;
  }
}
