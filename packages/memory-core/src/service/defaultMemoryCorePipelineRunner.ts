/**
 * MemoryCoreService が pipelineRunner オプション未指定時に使う、memory-core
 * 全パイプラインを順次実行する実装。
 *
 * このファイルは sql.js / better-sqlite3 / Ollama などの重い依存をロードする
 * ため、`MemoryCoreService` 本体からは遅延 require される。テストは
 * pipelineRunner オプションを差し替えて、このモジュールをまったく触らずに
 * 通せる構造にしてある。
 *
 * 既存 `packages/trail-server/src/runtime/memoryCoreRunner.ts` の
 * `runAfterImport()` 本体をそのまま移植し、Logger を PipelineLogger 抽象に
 * 差し替えた版。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createOllamaClient } from '@anytime-markdown/agent-core';
import {
  openMemoryCoreDb,
  attachTrailDbReadOnly,
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
} from '../index';
import { PipelineStatusWriter } from '../status/PipelineStatusWriter';
import type { PipelineRunnerContext } from './types';

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

export async function runMemoryCorePipeline(ctx: PipelineRunnerContext): Promise<void> {
  const { logger } = ctx;

  if (!fs.existsSync(ctx.trailDbPath)) {
    logger.error(`Trail DB not found: ${ctx.trailDbPath}`);
    return;
  }

  // Pipeline status writer — UI から realtime 表示するため (sql.js は in-memory)
  const statusPath = path.join(path.dirname(ctx.trailDbPath), 'pipeline-status.json');
  const statusWriter = new PipelineStatusWriter(statusPath, randomUUID(), PIPELINE_SCOPES);
  statusWriter.initialize();

  logger.info('Opening memory-core DB');
  const memDb = await openMemoryCoreDb(ctx.dbPath, {
    nativeBinding: ctx.nativeBinding,
  });
  try {
    logger.info(`Attaching trail DB: ${ctx.trailDbPath}`);
    await attachTrailDbReadOnly(memDb.db, ctx.trailDbPath);
    // better-sqlite3 は live commit のため save() は no-op、ATTACH も外れないので
    // reattach は不要。save() は呼び出し履歴の互換のために残す (実体は no-op)。
    const saveAndReattach = (): void => {
      memDb.save();
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
      const stateRow = stmt.get('conversation_incremental');
      const lastProcessedAt = (stateRow?.['last_processed_at'] as string) ?? '';
      stmt.free?.();

      const isFirstRun = !lastProcessedAt;

      // trail.db から user message 数を pre-count (ETA 表示用の概算 total)
      let convTotalEstimate = 0;
      try {
        const stmt = memDb.db.prepare(
          `SELECT COUNT(*) AS c FROM trail.messages WHERE timestamp >= ? AND type = 'user'`,
        );
        const countRow = stmt.get(lastProcessedAt || '1970-01-01T00:00:00.000Z');
        convTotalEstimate = (countRow?.['c'] as number) ?? 0;
        stmt.free?.();
      } catch {
        // ignore
      }
      statusWriter.start('conversation_incremental', convTotalEstimate || undefined);
      try {
        if (isFirstRun) {
          logger.info(`First run detected — running backfill (${ctx.backfillDays ?? 5} days)`);
          const result = await runConversationBackfill({
            db: memDb.db,
            ollama,
            sinceDays: ctx.backfillDays ?? 5,
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
      const gitRoot = ctx.gitRoot ?? process.cwd();
      const tsconfigPath =
        process.env['MEMORY_CORE_TSCONFIG'] ?? path.join(gitRoot, 'tsconfig.json');
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
        process.env['MEMORY_CORE_REVIEW_DIR'] ?? '/Shared/anytime-markdown-docs/review';
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
      logger.info(`Running spec incremental (specRoot=${specRoot})`);
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
          `Spec incremental: status=${specResult.status}, items_processed=${specResult.items_processed}, ` +
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
      logger.info(`Running drift detection`);
      statusWriter.start('drift_detection');
      try {
        const driftResult = await runDriftDetection({
          db: memDb.db,
          logger,
        });
        logger.info(
          `Drift detection: status=${driftResult.status}, ` +
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
      logger.info(`Running embedding backfill`);
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
          `Embedding backfill: status=${embedResult.status}, ` +
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
      // better-sqlite3 では ATTACH は同一接続のため close() 不要
      // (sql.js では trailHandle が別の WASM Database で別途 close が必要だった)
    }
  } finally {
    memDb.save();
    memDb.close();
  }
}
