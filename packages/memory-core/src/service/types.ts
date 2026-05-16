/**
 * MemoryCoreService の型定義。
 *
 * 共通 Runner 型 (RunReason / RunnerStatus / RunnerStartOptions / RunnerLogSink)
 * は `../runner/types` に集約されている。memory-core 固有の options 型のみ
 * このファイルで定義し、共通部分は alias として re-export する。
 */

import type {
  RunReason as BaseRunReason,
  RunnerLogSink as BaseRunnerLogSink,
  RunnerStartOptions as BaseRunnerStartOptions,
  RunnerStatus as BaseRunnerStatus,
} from '../runner/types';

// 後方互換: 既存 import パスを維持するため alias で re-export する
export type RunReason = BaseRunReason;
export type MemoryCoreLogSink = BaseRunnerLogSink;
export type MemoryCoreServiceStatus = BaseRunnerStatus;
export type MemoryCoreServiceStartOptions = BaseRunnerStartOptions;

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
  /**
   * memory-core.db の世代バックアップ設定。
   * - backupGenerations: 保持世代数 (0 以下で無効、既定 1)
   * - backupIntervalDays: 作成間隔 日 (0 で毎回、既定 1)
   * 既存 anytimeDatabase.backup.* 設定を再利用する想定。
   */
  backupGenerations?: number;
  backupIntervalDays?: number;
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
  /** memory-core.db 絶対パス (省略時はデフォルト: <workspaceRoot>/.anytime/db/memory-core.db) */
  dbPath?: string;
  /** better-sqlite3 native binding 絶対パス (拡張に必要) */
  nativeBinding?: string;
  /** Git working tree ルート (省略時は process.cwd()) */
  gitRoot?: string;
  /**
   * 状態ファイル絶対パス (省略時はデフォルト:
   * $TRAIL_HOME/memory-core-runner.json or <gitRoot>/.anytime/trail/memory-core-runner.json)
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
  /**
   * memory-core.db の世代バックアップ設定。anytimeDatabase.backup.* と
   * 同じ値を渡す想定。省略時は generations=1, intervalDays=1 (database-core
   * 既定値)。
   */
  backupGenerations?: number;
  backupIntervalDays?: number;
}
