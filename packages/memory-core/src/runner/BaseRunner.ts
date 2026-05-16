import { readState, writeState } from './state';
import type {
  BaseRunnerOptions,
  RunReason,
  RunnerLogSink,
  RunnerStartOptions,
  RunnerStatus,
} from './types';

const DEFAULT_USER_INITIATED_REASONS: ReadonlySet<RunReason> = new Set<RunReason>([
  'manual',
  'import',
]);

/**
 * 長寿命ランナーの共通基底クラス。
 *
 * - mutex で runOnce 同時実行を防止
 * - pause/resume 状態 + 各種 diagnostic (ticks/lastRunAt/lastError) を JSON 永続化
 * - 起動時 1 tick + 周期 setInterval を仕掛ける start/stop/dispose ライフサイクル
 *
 * subclass は `runImpl(reason)` のみ実装する。runImpl は例外を投げて良い
 * (基底側で catch して `lastError` に記録する)。
 */
export abstract class BaseRunner {
  protected readonly statePath: string;
  protected readonly schemaVersion: number;
  private readonly logSink: RunnerLogSink;
  private readonly logTag: string;
  private readonly userInitiatedReasons: ReadonlySet<RunReason>;
  protected status: RunnerStatus;
  private mutex: Promise<void> = Promise.resolve();
  private intervalTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private stopRequested = false;

  constructor(opts: BaseRunnerOptions) {
    this.statePath = opts.statePath;
    this.logTag = opts.logTag;
    this.logSink = opts.logSink;
    this.schemaVersion = opts.schemaVersion ?? 1;
    this.userInitiatedReasons = opts.userInitiatedReasons ?? DEFAULT_USER_INITIATED_REASONS;
    this.status = readState(this.statePath, {
      expectedSchemaVersion: this.schemaVersion,
      onWarning: (msg) => this.log(`[WARN] state file: ${msg}`),
    });
  }

  /**
   * subclass が実装する 1 周期分の処理本体。例外は throw して良い
   * (基底側で catch して `lastError` に記録する)。
   */
  protected abstract runImpl(reason: RunReason): Promise<void>;

  getStatus(): RunnerStatus {
    return { ...this.status };
  }

  async pause(by: string): Promise<RunnerStatus> {
    this.status.paused = true;
    this.status.pausedAt = new Date().toISOString();
    this.status.pausedBy = by;
    this.persistState();
    this.log(`[INFO] pause by=${by}`);
    return this.getStatus();
  }

  async resume(): Promise<RunnerStatus> {
    this.status.paused = false;
    this.status.pausedAt = null;
    this.status.pausedBy = null;
    this.persistState();
    this.log('[INFO] resume');
    return this.getStatus();
  }

  /**
   * 1 周期分の処理を実行する。pause 中 + 自動契機 (startup / periodic)
   * は skip して `ticksSkipped` を増やす。manual / import は pause を無視する
   * (ユーザーが明示的に起動した操作のため)。
   *
   * 例外はすべて吸収し `lastError` に記録する。caller には決して throw しない。
   */
  async runOnce(reason: RunReason): Promise<RunnerStatus> {
    const previous = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      if (this.status.paused && !this.isUserInitiated(reason)) {
        this.status.ticksSkipped += 1;
        this.persistState();
        this.log(`[INFO] skip (paused) reason=${reason}`);
        return this.getStatus();
      }

      this.status.running = true;
      this.status.lastReason = reason;
      this.persistState();
      const startedAt = Date.now();
      this.log(`[INFO] run start reason=${reason}`);

      let succeeded = false;
      try {
        await this.runImpl(reason);
        succeeded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.status.lastError = msg;
        this.log(
          `[ERROR] run failed: ${msg}${err instanceof Error && err.stack ? '\n' + err.stack : ''}`,
        );
      }

      if (succeeded) {
        this.status.ticksRun += 1;
        this.status.lastError = null;
      }
      this.status.lastDurationMs = Date.now() - startedAt;
      this.status.lastRunAt = new Date().toISOString();
      this.status.running = false;
      this.persistState();
      this.log(
        `[INFO] run end reason=${reason} durationMs=${this.status.lastDurationMs} ` +
          `ok=${succeeded} ticksRun=${this.status.ticksRun} ticksSkipped=${this.status.ticksSkipped}`,
      );
      return this.getStatus();
    } finally {
      release();
    }
  }

  /**
   * 起動時 tick + 周期 setInterval を仕掛ける。多重呼び出し時は既存タイマーを
   * クリアして上書きする (idempotent)。
   */
  start(intervalMs: number, options: RunnerStartOptions = {}): void {
    const runOnStart = options.runOnStart ?? true;
    const startupDelayMs = options.startupDelayMs ?? 5000;
    this.stopRequested = false;

    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.startupTimer) clearTimeout(this.startupTimer);

    if (runOnStart) {
      this.startupTimer = setTimeout(() => {
        if (this.stopRequested) return;
        void this.runOnce('startup');
      }, startupDelayMs);
    }

    if (intervalMs > 0) {
      this.intervalTimer = setInterval(() => {
        if (this.stopRequested) return;
        void this.runOnce('periodic');
      }, intervalMs);
    }

    this.log(
      `[INFO] start intervalMs=${intervalMs} runOnStart=${runOnStart} startupDelayMs=${startupDelayMs}`,
    );
  }

  /**
   * タイマーを停止する。実行中の runOnce は完走するため、確実な完了待ちは
   * `dispose()` を使う。idempotent。
   */
  stop(): void {
    this.stopRequested = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    this.log('[INFO] stop');
  }

  /** stop + in-flight runOnce 完了待ち + state ファイル fsync。 */
  async dispose(): Promise<void> {
    this.stop();
    await this.mutex;
    this.persistState();
  }

  protected isUserInitiated(reason: RunReason): boolean {
    return this.userInitiatedReasons.has(reason);
  }

  protected persistState(): void {
    try {
      writeState(this.statePath, this.status);
    } catch (err) {
      this.log(
        `[ERROR] failed to persist state to ${this.statePath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  protected log(msg: string): void {
    this.logSink.appendLine(`[${new Date().toISOString()}] [${this.logTag}] ${msg}`);
  }
}
