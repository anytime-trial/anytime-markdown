import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BaseRunner,
  type MemoryCoreService,
  type RunReason,
  type RunnerLogSink,
  getTrailHome,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

import { ImportAllPhaseStatusWriter } from '../jobs/ImportAllPhaseStatusFile';

// TrailDatabase.importAll の 4 番目の引数 (AnalyzeFunction) を再利用する。
// trail-db で named export されていないため、メソッドシグネチャから抽出する。
type ImportAllAnalyzeFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;
type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

export interface AnalyzeAllRunnerOptions {
  /** ログ書き込み先 (拡張: OutputChannel, daemon: Logger ラッパ) */
  logSink: RunnerLogSink;
  /** state ファイル絶対パス (省略時はデフォルト: $TRAIL_HOME/analyze-all-runner.json) */
  statePath?: string;
  /** Git working tree ルート (defaultStatePath のフォールバックで使用) */
  gitRoot?: string;
  /** importAll を実行する trail.db ハンドル (省略時は importAll をスキップ) */
  trailDb?: TrailDatabase;
  /** importAll の gitRoots 引数に渡す監視対象ルート集合 */
  gitRoots?: readonly string[];
  /** memory-core ingest pipeline を実行する service (省略時は memory-core ステップをスキップ) */
  memoryCoreService?: MemoryCoreService;
  /**
   * 指定時、importAll の per-phase 進捗を JSON ファイルに書き出す
   * (VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新するため)。
   */
  importAllStatusFilePath?: string;

  // -- Optional callback hooks (拡張モードでの UI 統合用) --
  /** importAll の onProgress に渡される。ログ・進捗バー更新等。 */
  onImportProgress?: (message: string, increment?: number) => void;
  /** importAll の analyzeFn (release coverage 等)。省略時は trail-db デフォルト挙動。 */
  analyzeReleaseFn?: ImportAllAnalyzeFn;
  /**
   * importAll の各 phase イベントに対するカスタムハンドラ (UI 進捗等)。
   * importAllStatusFilePath と独立に呼ばれる (両方設定時は両方発火)。
   */
  onImportPhase?: (event: ImportAllPhaseEvent) => void;
  /** 1 run 終了時 (成功・失敗を問わず) に呼ばれるフック (UI 更新通知用) */
  onAfterRun?: () => void;
}

/**
 * analyzeAll パイプライン (importAll → memory-core runOnce) の唯一の orchestrator。
 *
 * BaseRunner を継承し、pause/resume/state/ticks/lastRunAt を一元管理する。
 * MemoryCoreService は内部実行ユニットとしてのみ利用され、その pause API は
 * このリファクタ以降 user-facing には公開されない (CLI / HTTP / VS Code コマンド
 * は全て AnalyzeAllRunner を介する)。
 *
 * 設計:
 * - importAll の例外は catch して `importError` に保持し、その後 memory-core も
 *   実行する (どちらも独立して走らせ、失敗は最後にまとめて throw する)。
 * - memory-core 側は runOnce が例外を吸収する設計のため、`getStatus()` の
 *   lastError / lastRunAt 差分から「この run で失敗したか」を検出する。
 * - 両ステップの失敗はまとめて 1 つの Error として throw → BaseRunner が catch
 *   して AnalyzeAllRunner の `status.lastError` に記録する。
 * - 拡張モードでは onImportProgress / analyzeReleaseFn / onImportPhase / onAfterRun
 *   を渡すことで UI 統合 (pipelineProvider 通知・notifySessionsUpdated 等) を実現する。
 */
export class AnalyzeAllRunner extends BaseRunner {
  private readonly trailDb: TrailDatabase | undefined;
  private readonly memoryCoreService: MemoryCoreService | undefined;
  private readonly gitRoots: readonly string[];
  private readonly importAllStatusFilePath: string | undefined;
  private readonly onImportProgress: ((message: string, increment?: number) => void) | undefined;
  private readonly analyzeReleaseFn: ImportAllAnalyzeFn | undefined;
  private readonly onImportPhase: ((event: ImportAllPhaseEvent) => void) | undefined;
  private readonly onAfterRun: (() => void) | undefined;
  private lastImportResult: ImportAllResult | null = null;

  constructor(opts: AnalyzeAllRunnerOptions) {
    const resolvedStatePath = opts.statePath ?? defaultAnalyzeAllStatePath(opts.gitRoot);
    // 旧 memory-core-runner.json の paused=true を analyze-all-runner.json 不在時にのみ移送する。
    // 移送は constructor の super() 呼び出し前に副作用としてファイルへ書き込む。
    migrateLegacyPausedFromMemoryCore(resolvedStatePath, opts.gitRoot, opts.logSink);
    super({
      logSink: opts.logSink,
      logTag: 'anytime-analyze-all',
      statePath: resolvedStatePath,
    });
    this.trailDb = opts.trailDb;
    this.memoryCoreService = opts.memoryCoreService;
    this.gitRoots = opts.gitRoots ?? [];
    this.importAllStatusFilePath = opts.importAllStatusFilePath;
    this.onImportProgress = opts.onImportProgress;
    this.analyzeReleaseFn = opts.analyzeReleaseFn;
    this.onImportPhase = opts.onImportPhase;
    this.onAfterRun = opts.onAfterRun;
  }

  protected override async runImpl(reason: RunReason): Promise<void> {
    let importError: Error | null = null;
    let runError: Error | null = null;

    try {
      // Phase 1: importAll (trailDb 指定時のみ)
      if (this.trailDb) {
        const phaseWriter = this.importAllStatusFilePath
          ? new ImportAllPhaseStatusWriter(this.importAllStatusFilePath, randomUUID())
          : null;
        phaseWriter?.initialize();
        const phaseHandler = (event: ImportAllPhaseEvent): void => {
          phaseWriter?.applyEvent(event);
          this.onImportPhase?.(event);
        };
        try {
          this.lastImportResult = await this.trailDb.importAll(
            this.onImportProgress,
            this.gitRoots,
            undefined,
            this.analyzeReleaseFn,
            this.importAllStatusFilePath || this.onImportPhase ? phaseHandler : undefined,
          );
        } catch (err) {
          importError = err instanceof Error ? err : new Error(String(err));
          this.log(`[ERROR] importAll failed: ${importError.message}`);
        }
      }

      // Phase 2: memory-core runOnce (memoryCoreService 指定時のみ)
      if (this.memoryCoreService) {
        const memBefore = this.memoryCoreService.getStatus();
        const memAfter = await this.memoryCoreService.runOnce(reason);
        const memRan = memAfter.lastRunAt !== memBefore.lastRunAt;
        const memError = memRan && memAfter.lastError !== null ? memAfter.lastError : null;

        if (importError && memError) {
          runError = new Error(`importAll: ${importError.message}; memory-core: ${memError}`);
        } else if (importError) {
          runError = importError;
        } else if (memError) {
          runError = new Error(`memory-core: ${memError}`);
        }
      } else if (importError) {
        runError = importError;
      }
    } finally {
      // 成功・失敗を問わず通知 (UI 更新)。例外吸収して runImpl の throw を妨げない。
      try {
        this.onAfterRun?.();
      } catch (err) {
        this.log(`[WARN] onAfterRun callback failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (runError) throw runError;
  }

  /**
   * 直近 `runImpl` で実行した importAll の結果。失敗時 (例外発生) は更新されず、
   * 前回成功時の値が残る。trailDb 未設定時は常に null。
   */
  getLastImportResult(): ImportAllResult | null {
    return this.lastImportResult;
  }
}

/**
 * デフォルト state ファイルパス。
 * `$TRAIL_HOME/analyze-all-runner.json` を返す
 * (拡張: `<workspaceRoot>/.anytime/trail/analyze-all-runner.json`,
 *  daemon: `~/.anytime/trail/analyze-all-runner.json` 等)。
 */
export function defaultAnalyzeAllStatePath(workspaceRoot?: string): string {
  return join(getTrailHome(workspaceRoot), 'analyze-all-runner.json');
}

/**
 * 旧 memory-core-runner.json の paused=true を analyze-all-runner.json 不在時に
 * 移送する。リファクタ以前から pause 状態で運用しているユーザーの設定が再起動で
 * 消えないよう、初回起動時のみ実行する。
 *
 * - analyze-all-runner.json が既存 → 何もしない (二重移送禁止)
 * - 旧ファイル無し or paused=false → 何もしない
 * - 移送実行時は WARN ログを出し、新 state ファイル (paused=true) を atomic write する
 *
 * memory-core-runner.json 側の paused フィールドは互換のため残るが、リファクタ以降
 * AnalyzeAllRunner は読まない (memory-core 内部の自動契機もユーザー操作経路から
 * 切り離されている)。
 */
function migrateLegacyPausedFromMemoryCore(
  analyzeAllStatePath: string,
  workspaceRoot: string | undefined,
  logSink: RunnerLogSink,
): void {
  if (existsSync(analyzeAllStatePath)) return;
  const legacyPath = join(getTrailHome(workspaceRoot), 'memory-core-runner.json');
  if (!existsSync(legacyPath)) return;
  try {
    const raw = readFileSync(legacyPath, 'utf-8');
    const obj = JSON.parse(raw) as { paused?: boolean; pausedAt?: string; pausedBy?: string };
    if (obj.paused !== true) return;
    const ts = new Date().toISOString();
    logSink.appendLine(
      `[${ts}] [anytime-analyze-all] [WARN] Migrating paused state from ${legacyPath} → ${analyzeAllStatePath}. ` +
        `memory-core-runner.json paused field is no longer consulted post-refactor.`,
    );
    // 直接書き込む (BaseRunner はまだ初期化前なので writeState は呼べない)。
    // readState が schemaVersion 1 を期待するので最小限のフィールドで書く。
    const migrated = {
      schemaVersion: 1,
      paused: true,
      pausedAt: obj.pausedAt ?? ts,
      pausedBy: obj.pausedBy ?? 'migrated-from-memory-core',
      lastRunAt: null,
      lastDurationMs: null,
      lastReason: null,
      lastError: null,
      ticksRun: 0,
      ticksSkipped: 0,
      running: false,
    };
    // atomic write (tmp + rename) を簡易に再実装 (循環依存回避)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const dir = join(analyzeAllStatePath, '..');
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${analyzeAllStatePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(migrated, null, 2), 'utf-8');
    fs.renameSync(tmp, analyzeAllStatePath);
  } catch (err) {
    const ts = new Date().toISOString();
    logSink.appendLine(
      `[${ts}] [anytime-analyze-all] [WARN] Legacy paused migration failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
