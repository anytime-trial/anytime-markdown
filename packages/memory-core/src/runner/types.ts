/**
 * BaseRunner で共有する型定義。
 *
 * 長寿命ランナー (memory-core ingest / analyzeAll パイプライン) を共通の
 * pause/resume/state/ticks/lastRunAt パターンで揃えるための型。
 */

export type RunReason = 'startup' | 'periodic' | 'import' | 'manual';

/**
 * vscode.OutputChannel 互換の最小ログ書き込み先。
 * VS Code 拡張は OutputChannel を直接渡し、daemon は Logger をラップする。
 */
export interface RunnerLogSink {
  appendLine(msg: string): void;
}

/**
 * Runner 状態の永続化スキーマと getStatus() 戻り値を兼ねる。
 *
 * - paused / pausedAt / pausedBy: pause 状態 (cli / vscode-command / http-api からセット)
 * - lastRunAt: 最後に runOnce() が完了した時刻 (ISO 8601 UTC)
 * - lastDurationMs: 最後の runOnce() の実行時間
 * - lastReason: 最後の runOnce() の起動契機
 * - lastError: 最後の runOnce() が失敗した場合のエラーメッセージ
 * - ticksRun / ticksSkipped: 累積カウンタ (skip は pause 中の自動契機 tick)
 * - running: 現在 runOnce() 実行中か (mutex 状態の可視化用、再起動時は常に false)
 */
export interface RunnerStatus {
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

export interface RunnerStartOptions {
  /** 起動直後 ('startup') に runOnce を 1 回走らせるか (既定 true) */
  runOnStart?: boolean;
  /** 起動 tick までの待ち時間 ms (既定 5000) */
  startupDelayMs?: number;
}

export interface BaseRunnerOptions {
  /** ログ書き込み先 (拡張: OutputChannel, daemon: Logger ラッパ) */
  logSink: RunnerLogSink;
  /** ログ行の prefix tag (例: 'anytime-memory', 'anytime-analyze-all') */
  logTag: string;
  /** state ファイル絶対パス */
  statePath: string;
  /** state ファイルの schemaVersion (既定 1) */
  schemaVersion?: number;
  /** pause 中でも skip しない reason 集合 (既定: {'manual','import'}) */
  userInitiatedReasons?: ReadonlySet<RunReason>;
}
