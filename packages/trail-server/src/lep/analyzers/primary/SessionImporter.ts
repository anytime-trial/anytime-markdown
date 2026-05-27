import * as fs from 'node:fs';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

const BATCH_MESSAGE_LIMIT = 20_000;
const BATCH_FILE_LIMIT = 100;

export interface SessionImporterOptions {
  readonly trailDb: TrailDatabase;
  /** 拡張モードで importAll の onProgress に渡されるのと同じハンドラ */
  readonly onProgress?: (message: string, increment?: number) => void;
  /** Pipelines TreeView 用の `import_sessions` phase event を発火する hook */
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
}

/**
 * Layer 2 Primary Analyzer: `jsonl_session_discovered` event を購読して
 * `TrailDatabase.importSession()` を呼び出し、`session_imported` / `session_skipped`
 * event を emit する。
 *
 * 設計上のポイント:
 * - skip 判定 (file size unchanged) は本 analyzer 内で保持 (Ingester は無条件発見のみ)
 * - transaction batching (20k messages / 100 files) は本 analyzer 内で行う
 * - Phase 1 (`import_sessions`) の onPhase 発火 (start/finish) も本 analyzer が担う
 * - import に成功したセッション ID を `sessionsToAnalyze` で保持し、`getSessionsToAnalyze()`
 *   経由で ImportAllLegacyAnalyzer (Phase 6 analyze_behavior) に供給する
 *
 * 既存 `TrailDatabase.importAll()` の Phase 1 と等価な挙動を維持する。
 */
export class SessionImporter implements Analyzer {
  readonly id = 'SessionImporter';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['jsonl_session_discovered'];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['session_imported', 'session_skipped'];

  private readonly sessionsToAnalyze = new Set<string>();
  private importedFiles: ReturnType<TrailDatabase['getImportedFileMap']> | null = null;
  private inTransaction = false;
  private batchMessageCount = 0;
  private batchFileCount = 0;
  private importedCount = 0;
  private skippedCount = 0;
  private discoveredCount = 0;

  constructor(private readonly opts: SessionImporterOptions) {}

  /** Step 2c の BehaviorAnalyzer 等が参照する、import 済セッション ID 集合。 */
  getSessionsToAnalyze(): ReadonlySet<string> {
    return this.sessionsToAnalyze;
  }

  /** Wave 末端で参照する集計値 */
  getCounters(): { imported: number; skipped: number } {
    return { imported: this.importedCount, skipped: this.skippedCount };
  }

  async onRunStart(ctx: AnalyzerContext): Promise<void> {
    // run ごとに状態をリセット
    this.sessionsToAnalyze.clear();
    this.importedFiles = this.opts.trailDb.getImportedFileMap();
    this.inTransaction = false;
    this.batchMessageCount = 0;
    this.batchFileCount = 0;
    this.importedCount = 0;
    this.skippedCount = 0;
    this.discoveredCount = 0;

    this.opts.onPhase?.({ phase: 'import_sessions', action: 'start' });
    ctx.logger.info('[SessionImporter] start');
  }

  /**
   * 既存データとファイルサイズを比較してスキップ可否を判定する。
   * - 'skip': 変更なしでスキップ (skippedCount を更新)
   * - 'stat_error': statSync 失敗 (skippedCount を +1)
   * - null: インポートを続行
   */
  private checkSkipReason(
    existing: { fileSize: number },
    mainFile: string,
    sessionFileTotal: number,
    logger: AnalyzerContext['logger'],
  ): 'skip' | 'stat_error' | null {
    let currentFileSize = 0;
    try {
      currentFileSize = fs.statSync(mainFile).size;
    } catch (err) {
      logger.error(
        `[SessionImporter] statSync failed: ${mainFile} (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
      this.skippedCount += 1;
      return 'stat_error';
    }
    if (currentFileSize <= existing.fileSize) {
      this.skippedCount += sessionFileTotal;
      return 'skip';
    }
    return null;
  }

  private importFilesForSession(
    filesToImport: readonly { filePath: string; isSubagent: boolean }[],
    repoName: string,
    logger: AnalyzerContext['logger'],
  ): number {
    const db = this.opts.trailDb;
    let totalMsgCount = 0;
    for (const f of filesToImport) {
      try {
        const msgCount = db.importSession(f.filePath, repoName, f.isSubagent, true);
        this.importedCount += 1;
        this.batchMessageCount += msgCount;
        this.batchFileCount += 1;
        totalMsgCount += msgCount;
      } catch (err) {
        logger.error(
          `[SessionImporter] importSession failed: ${f.filePath} (${
            err instanceof Error ? err.message : String(err)
          })`,
        );
      }
    }
    return totalMsgCount;
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'jsonl_session_discovered') return;
    if (!this.importedFiles) return;
    this.discoveredCount++;

    const sessionFileTotal = 1 + e.subagentFiles.length;
    const existing = this.importedFiles.get(e.mainFile);
    if (existing && existing.hasMessages && existing.hasUsableCostData) {
      const skipReason = this.checkSkipReason(existing, e.mainFile, sessionFileTotal, ctx.logger);
      if (skipReason !== null) {
        await ctx.bus.publish({ kind: 'session_skipped', sessionId: e.sessionId, reason: 'file_unchanged' });
        return;
      }
    }

    // Import path
    this.sessionsToAnalyze.add(e.sessionId);
    const db = this.opts.trailDb;
    if (!this.inTransaction) {
      db.beginExternalTransaction();
      this.inTransaction = true;
      this.batchMessageCount = 0;
      this.batchFileCount = 0;
    }

    const filesToImport = [
      { filePath: e.mainFile, isSubagent: false },
      ...e.subagentFiles.map((f) => ({ filePath: f, isSubagent: true })),
    ];

    const totalMsgCount = this.importFilesForSession(filesToImport, e.repoName, ctx.logger);

    // Commit at session boundary when limits exceeded
    if (
      this.batchMessageCount >= BATCH_MESSAGE_LIMIT ||
      this.batchFileCount >= BATCH_FILE_LIMIT
    ) {
      this.commitBatch(ctx);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    await ctx.bus.publish({
      kind: 'session_imported',
      sessionId: e.sessionId,
      messageCount: totalMsgCount,
      repoName: e.repoName,
    });
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    // Drain remaining batch
    if (this.inTransaction) {
      this.commitBatch(ctx);
    }
    this.opts.onPhase?.({ phase: 'import_sessions', action: 'finish', count: this.importedCount });
    ctx.logger.info(
      `[SessionImporter] done (discovered=${this.discoveredCount}, imported=${this.importedCount}, skipped=${this.skippedCount})`,
    );
  }

  private commitBatch(ctx: AnalyzerContext): void {
    try {
      this.opts.trailDb.commitExternalTransaction();
    } catch (err) {
      ctx.logger.error(
        `[SessionImporter] COMMIT failed, rolling back: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      try {
        this.opts.trailDb.rollbackExternalTransaction();
      } catch (error_) {
        ctx.logger.error(
          `[SessionImporter] ROLLBACK also failed: ${
            error_ instanceof Error ? error_.message : String(error_)
          }`,
        );
      }
    }
    this.inTransaction = false;
  }
}
