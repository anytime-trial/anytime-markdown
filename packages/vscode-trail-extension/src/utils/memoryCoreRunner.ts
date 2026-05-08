import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  openMemoryCoreDb,
  attachTrailDbReadOnly,
  createOllamaClient,
  runConversationIncremental,
  runConversationBackfill,
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
          await attachTrailDbReadOnly(memDb.db, opts.trailDbPath);

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
