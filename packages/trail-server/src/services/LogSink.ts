import type { Logger, LogLevel } from '../runtime/Logger';
import type { LogService } from './LogService';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogSinkOptions {
  readonly service: LogService;
  readonly scope: string;
  readonly minLevel?: LogLevel;
}

/**
 * daemon 内部 logger を `extension_logs` テーブルへ永続化する Logger sink.
 * insertBatch が失敗しても呼び出し元には伝播させず best-effort で続行する。
 */
export class LogSink implements Logger {
  private readonly service: LogService;
  private readonly scope: string;
  private readonly minLevel: LogLevel;

  constructor(opts: LogSinkOptions) {
    this.service = opts.service;
    this.scope = opts.scope;
    this.minLevel = opts.minLevel ?? 'debug';
  }

  private push(level: LogLevel, msg: string, meta?: Record<string, unknown>, stack?: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    try {
      this.service.insertBatch(
        [{
          timestamp: new Date().toISOString(),
          level,
          component: this.scope,
          message: msg,
          metadata: meta ?? null,
          stack: stack ?? null,
        }],
        'daemon',
      );
    } catch {
      // best-effort: 永続化失敗で daemon を落とさない
    }
  }

  debug(msg: string, meta?: Record<string, unknown>): void { this.push('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>): void { this.push('info', msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>): void { this.push('warn', msg, meta); }
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void {
    const stack = err instanceof Error ? err.stack : undefined;
    this.push('error', msg, meta, stack);
  }

  child(scope: string): Logger {
    return new LogSink({
      service: this.service,
      scope: `${this.scope}.${scope}`,
      minLevel: this.minLevel,
    });
  }
}

/**
 * 複数の Logger に同じイベントを fan-out する composite logger.
 * primary は必ず呼び、others は best-effort で呼ぶ (primary 失敗時は throw)。
 */
export function combineLoggers(primary: Logger, ...others: Logger[]): Logger {
  const fanOut = <A extends unknown[]>(name: keyof Logger, args: A): void => {
    for (const o of others) {
      try {
        (o[name] as unknown as (...a: A) => void)(...args);
      } catch {
        // best-effort
      }
    }
  };

  const combined: Logger = {
    debug(msg, meta) {
      primary.debug(msg, meta);
      fanOut('debug', [msg, meta]);
    },
    info(msg, meta) {
      primary.info(msg, meta);
      fanOut('info', [msg, meta]);
    },
    warn(msg, meta) {
      primary.warn(msg, meta);
      fanOut('warn', [msg, meta]);
    },
    error(msg, err, meta) {
      primary.error(msg, err, meta);
      fanOut('error', [msg, err, meta]);
    },
    child(scope) {
      const childPrimary = primary.child(scope);
      const childOthers = others.map((o) => o.child(scope));
      return combineLoggers(childPrimary, ...childOthers);
    },
    dispose() {
      try { primary.dispose?.(); } catch { /* best-effort */ }
      for (const o of others) {
        try { o.dispose?.(); } catch { /* best-effort */ }
      }
    },
  };
  return combined;
}
