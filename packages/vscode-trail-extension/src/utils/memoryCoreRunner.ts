import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  openMemoryCoreDb,
  attachTrailDbReadOnly,
  createOllamaClient,
  runConversationIncremental,
  runConversationBackfill,
  runCodeIncremental,
  runBugHistoryIncremental,
  runReviewIncremental,
  runSpecIncremental,
  runAgentRunWatchdog,
} from '@anytime-markdown/memory-core';

export interface MemoryCoreRunner {
  runAfterImport(): Promise<void>;
}

export function createMemoryCoreRunner(opts: {
  outputChannel: vscode.OutputChannel;
  trailDbPath: string;
  dbPath?: string;
}): MemoryCoreRunner {
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

        logger.info('Opening memory-core DB');
        const memDb = await openMemoryCoreDb(opts.dbPath);
        try {
          logger.info(`Attaching trail DB: ${opts.trailDbPath}`);
          const attachHandle = await attachTrailDbReadOnly(memDb.db, opts.trailDbPath);
          try {
            // Timeout stale agent runs before starting pipelines
            const watchdogResult = runAgentRunWatchdog({ db: memDb.db, logger });
            if (watchdogResult.stale_count > 0) {
              logger.info(`Agent watchdog: ${watchdogResult.stale_count} stale run(s) timed out`);
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

            if (isFirstRun) {
              logger.info('First run detected — running backfill (7 days)');
              const result = await runConversationBackfill({
                db: memDb.db,
                ollama,
                sinceDays: 7,
                logger,
              });
              logger.info(
                `Backfill complete: status=${result.status}, items_processed=${result.items_processed}, ` +
                  `entities_inserted=${result.entities_inserted}, edges_inserted=${result.edges_inserted}`,
              );
            } else {
              logger.info(
                `Running incremental (since ${lastProcessedAt})`,
              );
              const result = await runConversationIncremental({
                db: memDb.db,
                ollama,
                logger,
              });
              logger.info(
                `Incremental complete: status=${result.status}, items_processed=${result.items_processed}, ` +
                  `entities_inserted=${result.entities_inserted}, edges_inserted=${result.edges_inserted}`,
              );
            }

            // ── Code incremental pipeline ────────────────────────────────
            const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
            const tsconfigPath =
              process.env['MEMORY_CORE_TSCONFIG'] ??
              path.join(gitRoot, 'tsconfig.json');
            const repoName = path.basename(gitRoot);
            logger.info(`Running code incremental (repo=${repoName}, tsconfig=${tsconfigPath})`);
            const codeResult = await runCodeIncremental({
              db: memDb.db,
              repoName,
              tsconfigPath,
              gitRoot,
              logger,
            });
            logger.info(
              `Code incremental: status=${codeResult.status}, items_processed=${codeResult.items_processed}, ` +
                `entities_inserted=${codeResult.entities_inserted}, edges_inserted=${codeResult.edges_inserted}, ` +
                `duration_ms=${codeResult.duration_ms}`,
            );

            // ── Bug history pipeline ─────────────────────────────────────
            logger.info(`Running bug history incremental (repo=${repoName})`);
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

            // ── Review incremental pipeline ──────────────────────────────────
            const reviewDir =
              process.env['MEMORY_CORE_REVIEW_DIR'] ??
              '/Shared/anytime-markdown-docs/review';
            logger.info(`Running review incremental (repo=${repoName}, dir=${reviewDir})`);
            const reviewResult = await runReviewIncremental({
              db: memDb.db,
              repoName,
              reviewDir,
              ollama,
              model: process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen3.5:9b',
              logger,
            });
            logger.info(
              `Review incremental: status=${reviewResult.status}, items_processed=${reviewResult.items_processed}, ` +
                `reviews_inserted=${reviewResult.reviews_inserted}, findings_inserted=${reviewResult.findings_inserted}, ` +
                `edges_inserted=${reviewResult.edges_inserted}, duration_ms=${reviewResult.duration_ms}`,
            );

            // ── Spec incremental pipeline ────────────────────────────────────
            const specRoot = process.env['MEMORY_CORE_SPEC_DIR'] ?? '/Shared/anytime-markdown-docs/spec';
            logger.info(`[${new Date().toISOString()}] [INFO] Running spec incremental (specRoot=${specRoot})`);
            const specResult = await runSpecIncremental({
              db: memDb.db,
              specRoot,
              ollama,
              model: process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen3.5:9b',
              logger,
            });
            logger.info(
              `[${new Date().toISOString()}] [INFO] Spec incremental: status=${specResult.status}, items_processed=${specResult.items_processed}, ` +
                `items_skipped=${specResult.items_skipped}, entities_inserted=${specResult.entities_inserted}, ` +
                `edges_inserted=${specResult.edges_inserted}, duration_ms=${specResult.duration_ms}`,
            );
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
