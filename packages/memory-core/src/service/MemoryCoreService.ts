import { join } from 'node:path';

import { readState, writeState, defaultState } from './state';
import type {
  MemoryCoreLogSink,
  MemoryCoreServiceOptions,
  MemoryCoreServiceStartOptions,
  MemoryCoreServiceStatus,
  PipelineLogger,
  PipelineRunnerContext,
  RunReason,
} from './types';

/**
 * memory-core ingest パイプラインをホストする長寿命サービス。
 *
 * - 起動時 1 回 + 周期実行 (`start(intervalMs)`)
 * - pause/resume を 3 制御面 (VS Code コマンド / CLI / HTTP API) から受ける
 * - mutex で `runOnce` 同時実行を防止
 * - 状態は JSON ファイルに永続化されプロセス再起動・拡張 reload 後も保持される
 *
 * 既存の `createMemoryCoreRunner().runAfterImport()` 本体は `pipelineRunner`
 * オプションに注入される。省略時はパッケージ内デフォルトを使用する。
 */
export class MemoryCoreService {
  private readonly opts: MemoryCoreServiceOptions;
  private readonly statePath: string;
  private status: MemoryCoreServiceStatus;
  private mutex: Promise<void> = Promise.resolve();
  private intervalTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private stopRequested = false;

  constructor(opts: MemoryCoreServiceOptions) {
    this.opts = opts;
    this.statePath = opts.statePath ?? defaultStatePath(opts.gitRoot);
    this.status = readState(this.statePath, {
      onWarning: (msg) => this.log(`[WARN] state file: ${msg}`),
    });
  }

  getStatus(): MemoryCoreServiceStatus {
    return { ...this.status };
  }

  async pause(by: string): Promise<MemoryCoreServiceStatus> {
    this.status.paused = true;
    this.status.pausedAt = new Date().toISOString();
    this.status.pausedBy = by;
    this.persistState();
    this.log(`[INFO] pause by=${by}`);
    return this.getStatus();
  }

  async resume(): Promise<MemoryCoreServiceStatus> {
    this.status.paused = false;
    this.status.pausedAt = null;
    this.status.pausedBy = null;
    this.persistState();
    this.log('[INFO] resume');
    return this.getStatus();
  }

  /**
   * 1 周期分のパイプラインを実行する。pause 中 + 自動契機 (startup/periodic)
   * は skip して ticksSkipped を増やす。manual / import は pause を無視する
   * (ユーザーが明示的に起動した操作のため)。
   *
   * 例外はすべて吸収し lastError に記録する。caller には決して throw しない。
   */
  async runOnce(reason: RunReason): Promise<MemoryCoreServiceStatus> {
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
        const ctx: PipelineRunnerContext = {
          logger: this.buildPipelineLogger(),
          trailDbPath: this.opts.trailDbPath,
          dbPath: this.opts.dbPath,
          nativeBinding: this.opts.nativeBinding,
          gitRoot: this.opts.gitRoot,
          backfillDays: this.opts.backfillDays,
        };
        const runner = this.opts.pipelineRunner ?? defaultPipelineRunner;
        await runner(ctx);
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
  start(intervalMs: number, options: MemoryCoreServiceStartOptions = {}): void {
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

  /**
   * stop + in-flight runOnce 完了待ち + 状態ファイル fsync。
   */
  async dispose(): Promise<void> {
    this.stop();
    await this.mutex;
    this.persistState();
  }

  // ---------------------------------------------------------------------------

  private isUserInitiated(reason: RunReason): boolean {
    return reason === 'manual' || reason === 'import';
  }

  private persistState(): void {
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

  private buildPipelineLogger(): PipelineLogger {
    return {
      info: (msg: string) => this.log(`[INFO] ${msg}`),
      error: (msg: string, err?: unknown) =>
        this.log(
          `[ERROR] ${msg}${
            err instanceof Error
              ? '\n' + (err.stack ?? err.message)
              : err !== undefined
                ? '\n' + String(err)
                : ''
          }`,
        ),
    };
  }

  private log(msg: string): void {
    this.opts.logSink.appendLine(`[${new Date().toISOString()}] [anytime-memory] ${msg}`);
  }
}

/**
 * テスト未注入時のデフォルト実装。memory-core 本体の全パイプラインを順次実行する。
 * 実体は `defaultMemoryCorePipelineRunner.ts` に分離 (循環依存と test 副作用を避けるため)。
 */
async function defaultPipelineRunner(ctx: PipelineRunnerContext): Promise<void> {
  // 遅延 import: テスト時にパイプラインモジュール (sql.js / better-sqlite3 など
  // の重い依存) をロードしないよう、デフォルト経路でのみ require する。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runMemoryCorePipeline } = require('./defaultMemoryCorePipelineRunner') as {
    runMemoryCorePipeline: (ctx: PipelineRunnerContext) => Promise<void>;
  };
  await runMemoryCorePipeline(ctx);
}

const PROTECTED_FALLBACK_PATTERNS = [
  /\/vscode-server\//,
  /\/vscode\/vscode-server\b/,
];

export function defaultStatePath(workspaceRoot?: string): string {
  if (process.env.TRAIL_HOME) return join(process.env.TRAIL_HOME, 'memory-core-runner.json');
  const root = workspaceRoot ?? process.cwd();
  if (!workspaceRoot && PROTECTED_FALLBACK_PATTERNS.some((p) => p.test(root))) {
    throw new Error(
      `[memory-core] defaultStatePath: refusing to fall back to protected path "${root}". ` +
        `Caller must pass workspaceRoot explicitly or set TRAIL_HOME.`,
    );
  }
  return join(root, '.anytime', 'trail', 'memory-core-runner.json');
}

// re-export so callers don't have to dig into state.ts
export { defaultState };
export type { MemoryCoreLogSink, MemoryCoreServiceOptions, MemoryCoreServiceStatus };
