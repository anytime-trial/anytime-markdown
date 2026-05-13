import type { Logger, LogLevel } from '@anytime-markdown/trail-server';

interface LogEntryPayload {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: unknown | null;
  stack?: string | null;
}

export interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean; status: number }>;
}

export interface DaemonSinkLoggerOptions {
  readonly baseUrl: string;
  readonly component?: string;
  readonly minLevel?: LogLevel;
  readonly fetcher?: FetchLike;
  readonly debounceMs?: number;
  readonly batchSize?: number;
  readonly ringMax?: number;
  readonly retryDelaysMs?: ReadonlyArray<number>;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RING_MAX = 256;
const DEFAULT_RETRY_DELAYS_MS: ReadonlyArray<number> = [1000, 3000, 9000];

/**
 * TrailLogger sink that POSTs batched log entries to the daemon's /api/logs.
 *
 * - Ring buffer (default 256) drops oldest entries when overflowing
 * - 250 ms debounce, 50-entry batch, immediate flush on error
 * - 1s/3s/9s retry on failure, drop after exhaustion (OutputChannel keeps copy)
 * - dispose() best-effort flushes remaining buffer
 */
export class DaemonSinkLogger implements Logger {
  private readonly opts: Required<DaemonSinkLoggerOptions>;
  private buffer: LogEntryPayload[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;

  constructor(options: DaemonSinkLoggerOptions) {
    this.opts = {
      baseUrl: options.baseUrl,
      component: options.component ?? 'TrailLogger',
      minLevel: options.minLevel ?? 'debug',
      fetcher:
        options.fetcher ??
        ((url, init) =>
          fetch(url, init) as unknown as Promise<{ ok: boolean; status: number }>),
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      ringMax: options.ringMax ?? DEFAULT_RING_MAX,
      retryDelaysMs: options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    };
  }

  /** Test/diagnostic helper. */
  bufferSize(): number {
    return this.buffer.length;
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.push('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.push('warn', message, metadata);
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    const stack = error instanceof Error ? error.stack : undefined;
    this.push('error', message, metadata, stack);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.push('debug', message, metadata);
  }

  child(scope: string): Logger {
    return new DaemonSinkLogger({
      ...this.opts,
      component: `${this.opts.component}.${scope}`,
    });
  }

  async dispose(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length > 0) await this.flush();
  }

  private push(level: LogLevel, message: string, metadata?: unknown, stack?: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.opts.minLevel]) return;
    const entry: LogEntryPayload = {
      timestamp: new Date().toISOString(),
      level,
      component: this.opts.component,
      message,
      metadata: metadata ?? null,
      stack: stack ?? null,
    };
    this.buffer.push(entry);
    while (this.buffer.length > this.opts.ringMax) this.buffer.shift();

    if (level === 'error') {
      this.scheduleImmediate();
      return;
    }
    if (this.buffer.length >= this.opts.batchSize) {
      this.scheduleImmediate();
      return;
    }
    if (this.timer == null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.opts.debounceMs);
    }
  }

  private scheduleImmediate(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.inflight || this.buffer.length === 0) return;
    this.inflight = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.send(batch);
    } finally {
      this.inflight = false;
    }
  }

  private async send(batch: LogEntryPayload[]): Promise<void> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/api/logs`;
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
    };

    for (let attempt = 0; attempt <= this.opts.retryDelaysMs.length; attempt++) {
      try {
        const res = await this.opts.fetcher(url, init);
        if (res.ok) return;
      } catch {
        // network error; will retry below
      }
      const delay = this.opts.retryDelaysMs[attempt];
      if (delay != null) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    // すべて失敗。OutputChannel には残るので致命的でない。
    // 古いものから捨ててバッファに戻す (リングサイズに収める)。
    const space = Math.max(0, this.opts.ringMax - this.buffer.length);
    if (space > 0) {
      this.buffer.unshift(...batch.slice(-space));
    }
  }
}
