import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type initSqlJsFn from 'sql.js';
import {
  openMemoryCoreDb,
  attachTrailDbReadOnly,
  createOllamaClient,
  runConversationIncremental,
  runConversationBackfill,
  runConversationFailedItemsRetry,
  runCodeIncremental,
  runBugHistoryIncremental,
  runReviewIncremental,
  runSpecIncremental,
  runAgentRunWatchdog,
  runPipelineWatchdog,
  runDriftDetection,
  runEmbeddingBackfill,
  runCodeReconciliation,
  PipelineStatusWriter,
  setSqlJsLoader,
} from '@anytime-markdown/memory-core';
import { randomUUID } from 'node:crypto';

const PIPELINE_SCOPES = [
  'conversation_incremental',
  'conversation_failed_items_retry',
  'code_incremental',
  'code_reconciliation',
  'bug_history_incremental',
  'review_incremental',
  'spec_incremental',
  'drift_detection',
  'embedding_backfill',
];

// VS Code 拡張は webpack バンドル後の VSIX に node_modules を同梱しないため、
// `import 'sql.js'` を webpack に解決させると UMD wrapper が壊れて activate に
// 失敗する。dist/sql-wasm.js を __non_webpack_require__ で runtime 直接ロードして
// 回避する (trail-db init() と同じパターン)。
declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

let sqlJsLoaderInstalled = false;
function installSqlJsLoaderOnce(distPath: string): void {
  if (sqlJsLoaderInstalled) return;
  sqlJsLoaderInstalled = true;
  setSqlJsLoader(async () => {
    const sqlWasmPath = path.join(distPath, 'sql-wasm.js');
    if (typeof __non_webpack_require__ !== 'function') {
      // webpack バンドル外で memoryCoreRunner が呼ばれた場合 (一部テストなど) の
      // フォールバック。通常 require は webpack 経由でも動くが、sql.js の
      // module.exports 代入が壊れるため拡張環境では発生しない想定。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const initSqlJs = require('sql.js') as typeof initSqlJsFn;
      return await initSqlJs({ locateFile: (file: string) => path.join(distPath, file) });
    }
    const initSqlJs = __non_webpack_require__(sqlWasmPath) as typeof initSqlJsFn;
    return await initSqlJs({ locateFile: (file: string) => path.join(distPath, file) });
  });
}

export interface MemoryCoreRunner {
  runAfterImport(): Promise<void>;
}

export function createMemoryCoreRunner(opts: {
  outputChannel: vscode.OutputChannel;
  trailDbPath: string;
  dbPath?: string;
  /**
   * sql.js (sql-wasm.js / sql-wasm.wasm) が CopyPlugin で配置されている dist
   * ディレクトリ。指定された場合のみ memory-core の sql.js loader を
   * `__non_webpack_require__` 経由で inject する (extension 起動時に必要)。
   */
  distPath?: string;
}): MemoryCoreRunner {
  if (opts.distPath) installSqlJsLoaderOnce(opts.distPath);
  return {
    async runAfterImport(): Promise<void> {
      const logger = {
        info: (msg: string) =>
          opts.outputChannel.appendLine(
            `[${new Date().toISOString()}] [INFO] [memory-core] ${msg}`,
          ),
        error: (msg: string, err?: unknown) =>
          opts.outputChannel.appendLine(
            `[${new Date().toISOString()}] [ERROR] [memory-core] ${msg}${
              err instanceof Error
                ? '\n' + err.stack
                : err !== undefined
                  ? '\n' + String(err)
                  : ''
            }`,
          ),
      };

      try {
        if (!fs.existsSync(opts.trailDbPath)) {
          logger.error(`Trail DB not found: ${opts.trailDbPath}`);
          return;
        }

        // Pipeline status writer — UI から realtime 表示するため (sql.js は in-memory)
        const statusPath = path.join(path.dirname(opts.trailDbPath), 'pipeline-status.json');
        const statusWriter = new PipelineStatusWriter(statusPath, randomUUID(), PIPELINE_SCOPES);
        statusWriter.initialize();

        logger.info('Opening memory-core DB');
        const memDb = await openMemoryCoreDb(opts.dbPath);
        try {
          logger.info(`Attaching trail DB: ${opts.trailDbPath}`);
          const attachHandle = await attachTrailDbReadOnly(memDb.db, opts.trailDbPath);
          // sql.js の export() は sqlite3_close → sqlite3_open を内部実行するため
          // save() のたびに ATTACH が外れる。save 後に再度 ATTACH する必要がある。
          const trailFilename = (attachHandle.trailHandle as unknown as { filename: string }).filename;
          const saveAndReattach = () => {
            memDb.save();
            memDb.db.run(`ATTACH DATABASE '${trailFilename}' AS trail`);
          };
          try {
            // Timeout stale agent runs before starting pipelines
            const watchdogResult = runAgentRunWatchdog({ db: memDb.db, logger });
            if (watchdogResult.stale_count > 0) {
              logger.info(`Agent watchdog: ${watchdogResult.stale_count} stale run(s) timed out`);
            }

            // Recover pipeline_runs / pipeline_state left in 'running' state by a
            // previous crash or VS Code reload, so the next pipeline isn't blocked.
            const pipelineWd = runPipelineWatchdog({ db: memDb.db, logger });
            if (pipelineWd.stale_runs > 0 || pipelineWd.stale_states > 0) {
              logger.info(
                `Pipeline watchdog: ${pipelineWd.stale_runs} stale run(s), ${pipelineWd.stale_states} orphan state(s) cleaned`,
              );
            }

            const ollama = createOllamaClient();

            // Check pipeline state to decide incremental vs backfill
            const stmt = memDb.db.prepare(
              `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`,
            );
            stmt.bind(['conversation_incremental']);
            let lastProcessedAt = '';
            if (stmt.step()) {
              lastProcessedAt =
                (stmt.getAsObject()['last_processed_at'] as string) ?? '';
            }
            stmt.free();

            const isFirstRun = !lastProcessedAt;

            // trail.db から user message 数を pre-count (ETA 表示用の概算 total)
            let convTotalEstimate = 0;
            try {
              const stmt = memDb.db.prepare(
                `SELECT COUNT(*) FROM trail.messages WHERE timestamp >= ? AND type = 'user'`,
              );
              stmt.bind([lastProcessedAt || '1970-01-01T00:00:00.000Z']);
              if (stmt.step()) {
                convTotalEstimate = (stmt.getAsObject()['COUNT(*)'] as number) ?? 0;
              }
              stmt.free();
            } catch {
              // ignore
            }
            statusWriter.start('conversation_incremental', convTotalEstimate || undefined);
            try {
              if (isFirstRun) {
                logger.info('First run detected — running backfill (5 days)');
                const result = await runConversationBackfill({
                  db: memDb.db,
                  ollama,
                  sinceDays: 5,
                  logger,
                  save: () => saveAndReattach(),
                });
                logger.info(
                  `Backfill complete: status=${result.status}, items_processed=${result.items_processed}, ` +
                    `entities_inserted=${result.entities_inserted}, edges_inserted=${result.edges_inserted}`,
                );
                statusWriter.finish('conversation_incremental', result.status, result.items_processed, result.items_failed);
              } else {
                logger.info(`Running incremental (since ${lastProcessedAt})`);
                const result = await runConversationIncremental({
                  db: memDb.db,
                  ollama,
                  logger,
                  save: () => saveAndReattach(),
                  progress: (processed, failed) =>
                    statusWriter.update('conversation_incremental', processed, failed),
                });
                logger.info(
                  `Incremental complete: status=${result.status}, items_processed=${result.items_processed}, ` +
                    `entities_inserted=${result.entities_inserted}, edges_inserted=${result.edges_inserted}`,
                );
                statusWriter.finish('conversation_incremental', result.status, result.items_processed, result.items_failed);
              }
            } catch (err) {
              statusWriter.finish('conversation_incremental', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            // pipeline 完了ごとに save (リロード時のデータ消失を防ぐ)
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (conversation_incremental): ${Date.now() - t0}ms`); }

            // ── Conversation failed-items retry ──────────────────────────
            // backfill / incremental で extraction が失敗した episode を
            // memory_failed_items から拾い直す。MEMORY_CORE_FAILED_RETRY_MAX
            // (既定 3) に達した item は永続 skip され、人手介入対象として残る。
            logger.info('Running conversation failed-items retry');
            statusWriter.start('conversation_failed_items_retry');
            try {
              const retryResult = await runConversationFailedItemsRetry({
                db: memDb.db,
                ollama,
                logger,
                save: () => memDb.save(),
              });
              logger.info(
                `Failed-items retry: status=${retryResult.status}, items_retried=${retryResult.items_retried}, ` +
                  `items_recovered=${retryResult.items_recovered}, items_failed=${retryResult.items_failed}`,
              );
              statusWriter.finish('conversation_failed_items_retry', retryResult.status, retryResult.items_retried, retryResult.items_failed);
            } catch (err) {
              statusWriter.finish('conversation_failed_items_retry', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (failed_items_retry): ${Date.now() - t0}ms`); }

            // ── Code incremental pipeline ────────────────────────────────
            const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
            const tsconfigPath =
              process.env['MEMORY_CORE_TSCONFIG'] ??
              path.join(gitRoot, 'tsconfig.json');
            const repoName = path.basename(gitRoot);
            logger.info(`Running code incremental (repo=${repoName}, tsconfig=${tsconfigPath})`);
            statusWriter.start('code_incremental');
            let codeEntityIds = new Set<string>();
            let codeWasSkipped = false;
            try {
              const codeResult = await runCodeIncremental({
                db: memDb.db,
                repoName,
                tsconfigPath,
                gitRoot,
                logger,
              });
              codeEntityIds = codeResult.current_entity_ids;
              codeWasSkipped = codeResult.status === 'skipped';
              logger.info(
                `Code incremental: status=${codeResult.status}, items_processed=${codeResult.items_processed}, ` +
                  `entities_inserted=${codeResult.entities_inserted}, edges_inserted=${codeResult.edges_inserted}, ` +
                  `current_entity_ids=${codeEntityIds.size}, duration_ms=${codeResult.duration_ms}`,
              );
              statusWriter.finish('code_incremental', codeResult.status === 'skipped' ? 'skipped' : codeResult.status, codeResult.items_processed, 0);
            } catch (err) {
              statusWriter.finish('code_incremental', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (code_incremental): ${Date.now() - t0}ms`); }

            // ── Code reconciliation pipeline ─────────────────────────────────
            // code_incremental が skipped (graph 未更新) なら entity_ids が空なので
            // snapshot に含まれない既存 entity が全て soft-delete されてしまう。
            // skipped 時は reconciliation も skip する。
            logger.info(`Running code reconciliation (repo=${repoName}, candidates=${codeEntityIds.size})`);
            statusWriter.start('code_reconciliation');
            try {
              if (codeWasSkipped) {
                logger.info(`Code reconciliation: skipped (code_incremental was skipped)`);
                statusWriter.finish('code_reconciliation', 'skipped', 0, 0);
              } else {
                const reconResult = runCodeReconciliation({
                  db: memDb.db,
                  repoName,
                  currentEntityIds: codeEntityIds,
                  recordedAt: new Date().toISOString(),
                  logger,
                });
                logger.info(
                  `Code reconciliation: status=${reconResult.status}, scanned=${reconResult.scanned}, ` +
                    `soft_deleted=${reconResult.soft_deleted}, duration_ms=${reconResult.duration_ms}`,
                );
                statusWriter.finish('code_reconciliation', reconResult.status, reconResult.soft_deleted, 0);
              }
            } catch (err) {
              statusWriter.finish('code_reconciliation', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (code_reconciliation): ${Date.now() - t0}ms`); }

            // ── Bug history pipeline ─────────────────────────────────────
            logger.info(`Running bug history incremental (repo=${repoName})`);
            statusWriter.start('bug_history_incremental');
            try {
              const bugResult = await runBugHistoryIncremental({
                db: memDb.db,
                repoName,
                repoRoot: gitRoot,
                logger,
              });
              logger.info(
                `Bug history: status=${bugResult.status}, items_processed=${bugResult.items_processed}, ` +
                  `bugs_inserted=${bugResult.bugs_inserted}, edges_inserted=${bugResult.edges_inserted}, ` +
                  `duration_ms=${bugResult.duration_ms}`,
              );
              statusWriter.finish('bug_history_incremental', bugResult.status, bugResult.items_processed, 0);
            } catch (err) {
              statusWriter.finish('bug_history_incremental', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (bug_history_incremental): ${Date.now() - t0}ms`); }

            // ── Review incremental pipeline ──────────────────────────────────
            const reviewDir =
              process.env['MEMORY_CORE_REVIEW_DIR'] ??
              '/Shared/anytime-markdown-docs/review';
            logger.info(`Running review incremental (repo=${repoName}, dir=${reviewDir})`);
            statusWriter.start('review_incremental');
            try {
              const reviewResult = await runReviewIncremental({
                db: memDb.db,
                repoName,
                reviewDir,
                ollama,
                model: process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b',
                logger,
              });
              logger.info(
                `Review incremental: status=${reviewResult.status}, items_processed=${reviewResult.items_processed}, ` +
                  `reviews_inserted=${reviewResult.reviews_inserted}, findings_inserted=${reviewResult.findings_inserted}, ` +
                  `edges_inserted=${reviewResult.edges_inserted}, duration_ms=${reviewResult.duration_ms}`,
              );
              statusWriter.finish('review_incremental', reviewResult.status, reviewResult.items_processed, 0);
            } catch (err) {
              statusWriter.finish('review_incremental', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (review_incremental): ${Date.now() - t0}ms`); }

            // ── Spec incremental pipeline ────────────────────────────────────
            const specRoot = process.env['MEMORY_CORE_SPEC_DIR'] ?? '/Shared/anytime-markdown-docs/spec';
            logger.info(`[${new Date().toISOString()}] [INFO] Running spec incremental (specRoot=${specRoot})`);
            statusWriter.start('spec_incremental');
            try {
              const specResult = await runSpecIncremental({
                db: memDb.db,
                specRoot,
                ollama,
                model: process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b',
                logger,
              });
              logger.info(
                `[${new Date().toISOString()}] [INFO] Spec incremental: status=${specResult.status}, items_processed=${specResult.items_processed}, ` +
                  `items_skipped=${specResult.items_skipped}, entities_inserted=${specResult.entities_inserted}, ` +
                  `edges_inserted=${specResult.edges_inserted}, duration_ms=${specResult.duration_ms}`,
              );
              statusWriter.finish('spec_incremental', specResult.status, specResult.items_processed, 0);
            } catch (err) {
              statusWriter.finish('spec_incremental', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (spec_incremental): ${Date.now() - t0}ms`); }

            // ── Drift detection pipeline ─────────────────────────────────────
            logger.info(`[${new Date().toISOString()}] [INFO] Running drift detection`);
            statusWriter.start('drift_detection');
            try {
              const driftResult = await runDriftDetection({
                db: memDb.db,
                logger,
              });
              logger.info(
                `[${new Date().toISOString()}] [INFO] Drift detection: status=${driftResult.status}, ` +
                  `events_inserted=${driftResult.events_inserted}, events_updated=${driftResult.events_updated}, ` +
                  `events_resolved=${driftResult.events_resolved}, duration_ms=${driftResult.duration_ms}`,
              );
              statusWriter.finish('drift_detection', driftResult.status, driftResult.events_inserted + driftResult.events_updated, 0);
            } catch (err) {
              statusWriter.finish('drift_detection', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (drift_detection): ${Date.now() - t0}ms`); }

            // ── Embedding backfill ──────────────────────────────────────────
            // 各パイプラインが追加した entity の embedding を bge-m3 で生成。
            // NULL embedding のみ対象なので冪等 (毎回呼んでも追加分のみ処理)。
            logger.info(`[${new Date().toISOString()}] [INFO] Running embedding backfill`);
            statusWriter.start('embedding_backfill');
            try {
              const embedResult = await runEmbeddingBackfill({
                db: memDb.db,
                ollama,
                logger,
                onTotal: (total) => statusWriter.start('embedding_backfill', total),
                progress: (processed, failed) =>
                  statusWriter.update('embedding_backfill', processed, failed),
              });
              logger.info(
                `[${new Date().toISOString()}] [INFO] Embedding backfill: status=${embedResult.status}, ` +
                  `items_processed=${embedResult.items_processed}, items_skipped=${embedResult.items_skipped}, ` +
                  `items_failed=${embedResult.items_failed}`,
              );
              statusWriter.finish('embedding_backfill', embedResult.status, embedResult.items_processed, embedResult.items_failed);
            } catch (err) {
              statusWriter.finish('embedding_backfill', 'error', 0, 0, err instanceof Error ? err.message : String(err));
              throw err;
            }
            { const t0 = Date.now(); saveAndReattach(); logger.info(`Saved (embedding_backfill): ${Date.now() - t0}ms`); }
          } finally {
            // Release the WASM heap copy of trail DB (~800MB) after every run.
            attachHandle.trailHandle.close();
          }
        } finally {
          memDb.save();
          memDb.close();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        opts.outputChannel.appendLine(
          `[${new Date().toISOString()}] [ERROR] [memory-core] runAfterImport failed: ${msg}${
            err instanceof Error && err.stack ? '\n' + err.stack : ''
          }`,
        );
      }
    },
  };
}
