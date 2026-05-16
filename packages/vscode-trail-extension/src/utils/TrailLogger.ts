import * as vscode from 'vscode';
import type { Logger, LogLevel } from '@anytime-markdown/trail-server';
import { combineLoggers } from '@anytime-markdown/trail-server';

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR',
};
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10, info: 20, warn: 30, error: 40,
};

// ---------------------------------------------------------------------------
//  OutputChannelLogger — implements Logger IF backed by vscode.OutputChannel
// ---------------------------------------------------------------------------

export class OutputChannelLogger implements Logger {
  constructor(
    private readonly channel: vscode.OutputChannel,
    private readonly level: LogLevel = 'info',
    private readonly scope?: string,
  ) {}

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>, err?: unknown): void {
    if (!this.shouldLog(level)) return;
    const ts = new Date().toISOString();
    const scopeStr = this.scope ? ` [${this.scope}]` : '';
    const metaStr = meta
      ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
      : '';
    this.channel.appendLine(`[${ts}] [${LEVEL_LABEL[level]}]${scopeStr} ${msg}${metaStr}`);
    if (err instanceof Error && err.stack) this.channel.appendLine(err.stack);
    else if (err !== undefined) this.channel.appendLine(String(err));
  }

  debug(msg: string, meta?: Record<string, unknown>): void { this.write('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>): void { this.write('info', msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>): void { this.write('warn', msg, meta); }
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void {
    this.write('error', msg, meta, err);
  }
  child(scope: string): Logger {
    const childScope = this.scope ? `${this.scope}/${scope}` : scope;
    return new OutputChannelLogger(this.channel, this.level, childScope);
  }
}

// ---------------------------------------------------------------------------
//  Legacy singleton helpers (backward-compat with existing callers)
// ---------------------------------------------------------------------------

let _channel: vscode.OutputChannel | undefined;
let _logger: OutputChannelLogger | undefined;
const _sinks: Logger[] = [];

function getChannel(): vscode.OutputChannel {
  _channel ??= vscode.window.createOutputChannel('Anytime Trail');
  return _channel;
}

function ts(): string {
  return new Date().toISOString();
}

function formatMeta(meta: unknown): string {
  if (meta === undefined) return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

export const TrailLogger = {
  /**
   * Initialize TrailLogger with an externally created OutputChannel.
   * Call this near the top of `activate()` to avoid lazy channel creation.
   */
  init(channel: vscode.OutputChannel): void {
    _channel = channel;
    _logger = new OutputChannelLogger(channel, 'info');
  },

  /**
   * Return a Logger IF instance backed by the current OutputChannel plus any
   * sinks registered via `addSink()`. If no sinks are present, returns the
   * OutputChannelLogger directly.
   *
   * Must be called after `init()`.
   */
  asLogger(): Logger {
    if (_logger == null) {
      const ch = getChannel();
      _logger = new OutputChannelLogger(ch, 'info');
    }
    if (_sinks.length === 0) return _logger;
    return combineLoggers(_logger, ..._sinks);
  },

  /**
   * Register an additional Logger sink. asLogger() returns a composite that
   * fans out to OutputChannel + all registered sinks. Legacy info()/warn()/
   * error()/debug() helpers also fan out to sinks.
   */
  addSink(sink: Logger): void {
    _sinks.push(sink);
  },

  /** Unregister a previously-added sink. */
  removeSink(sink: Logger): void {
    const i = _sinks.indexOf(sink);
    if (i >= 0) _sinks.splice(i, 1);
  },

  info(msg: string): void {
    getChannel().appendLine(`[${ts()}] [INFO] ${msg}`);
    for (const s of _sinks) {
      try { s.info(msg); } catch { /* best-effort */ }
    }
  },
  warn(msg: string): void {
    getChannel().appendLine(`[${ts()}] [WARN] ${msg}`);
    for (const s of _sinks) {
      try { s.warn(msg); } catch { /* best-effort */ }
    }
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : '';
    getChannel().appendLine(`[${ts()}] [ERROR] ${msg}${detail}`);
    if (err instanceof Error && err.stack) {
      getChannel().appendLine(err.stack);
    }
    for (const s of _sinks) {
      try { s.error(msg, err); } catch { /* best-effort */ }
    }
  },
  debug(msg: string): void {
    if (process.env.TRAIL_DEBUG !== '1') return;
    getChannel().appendLine(`[${ts()}] [DEBUG] ${msg}`);
    for (const s of _sinks) {
      try { s.debug?.(msg); } catch { /* best-effort */ }
    }
  },
  debugSql(meta: unknown): void {
    if (process.env.TRAIL_DEBUG_SQL !== '1') return;
    getChannel().appendLine(`[${ts()}] [DEBUG:SQL]${formatMeta(meta)}`);
  },
  debugPerf(meta: unknown): void {
    if (process.env.TRAIL_DEBUG_PERF !== '1') return;
    getChannel().appendLine(`[${ts()}] [DEBUG:PERF]${formatMeta(meta)}`);
  },
  dispose(): void {
    _sinks.length = 0;
    _logger = undefined;
    _channel?.dispose();
    _channel = undefined;
  },
};
