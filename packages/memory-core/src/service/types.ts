/**
 * MemoryCoreService の型定義。
 *
 * memoryCoreRunner.runAfterImport() を長寿命サービス化し、pause/resume と
 * 周期実行を備えた MemoryCoreService の入出力を定義する。
 */

export type RunReason = 'startup' | 'periodic' | 'import' | 'manual';

/**
 * vscode.OutputChannel 互換の最小ログ書き込み先。
 * VS Code 拡張は vscode.OutputChannel を直接渡し、daemon は
 * Logger をラップして渡す。
 */
export interface MemoryCoreLogSink {
  appendLine(msg: string): void;
}

/**
 * 状態ファイル (memory-core-runner.json) のスキーマと
 * service.getStatus() の戻り値を兼ねる。
 *
 * - paused/pausedAt/pausedBy: pause 状態 (cli/vscode-command/http-api からセット)
 * - lastRunAt: 最後に runOnce() が完了した時刻 (ISO 8601 UTC)
 * - lastDurationMs: 最後の runOnce() の実行時間
 * - lastReason: 最後の runOnce() の起動契機
 * - lastError: 最後の runOnce() が失敗した場合のエラーメッセージ
 * - ticksRun/ticksSkipped: 累積カウンタ (skip は pause 中の周期 tick)
 * - running: 現在 runOnce() 実行中か (mutex 状態の可視化用)
 */
export interface MemoryCoreServiceStatus {
  schemaVersion: number;
  paused: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastReason: RunReason | null;
  lastError: string | null;
  ticksRun: number;
  ticksSkipped: number;
  running: boolean;
}

/**
 * 1 回分のパイプライン実行に渡されるコンテキスト。
 * デフォルトの pipelineRunner は memory-core の全パイプラインを順次実行する。
 * テストでは pipelineRunner オプションを差し替えて副作用を排除する。
 */
export interface PipelineRunnerContext {
  logger: PipelineLogger;
  trailDbPath: string;
  dbPath?: string;
  nativeBinding?: string;
  gitRoot?: string;
  /** 初回 backfill 期間 (日)。省略時は runner 側 default (5)。 */
  backfillDays?: number;
}

export interface PipelineLogger {
  info(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export interface MemoryCoreServiceOptions {
  /** Pipeline ログの書き込み先 (拡張: OutputChannel, daemon: Logger ラッパ) */
  logSink: MemoryCoreLogSink;
  /** trail.db 絶対パス */
  trailDbPath: string;
  /** memory-core.db 絶対パス (省略時はデフォルト: ~/.claude/memory-core/memory-core.db) */
  dbPath?: string;
  /** better-sqlite3 native binding 絶対パス (拡張に必要) */
  nativeBinding?: string;
  /** Git working tree ルート (省略時は process.cwd()) */
  gitRoot?: string;
  /**
   * 状態ファイル絶対パス (省略時はデフォルト:
   * $TRAIL_HOME/memory-core-runner.json or ~/.claude/trail/memory-core-runner.json)
   */
  statePath?: string;
  /**
   * テスト用のシーム。実 pipeline を差し替えるための注入ポイント。
   * 省略時は memory-core 本体の全パイプラインを順次実行する
   * defaultMemoryCorePipelineRunner が使われる。
   */
  pipelineRunner?: (ctx: PipelineRunnerContext) => Promise<void>;
  /**
   * 初回 backfill (memory_pipeline_state.last_processed_at が空の場合) で
   * trail.db から遡って読み込む日数。省略時は 5 日。
   */
  backfillDays?: number;
}

export interface MemoryCoreServiceStartOptions {
  /** 起動直後 ('startup') に runOnce を 1 回走らせるか (既定 true) */
  runOnStart?: boolean;
  /** 起動 tick までの待ち時間 (既定 5000ms) */
  startupDelayMs?: number;
}
