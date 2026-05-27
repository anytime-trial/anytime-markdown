import { createHash } from 'node:crypto';
import type { MemoryDbConnection } from '../db/connection/types';
import { encodeEmbedding } from '../embedding/codec';
import { noopLogger, type MemoryLogger } from '../logger';
import type { OllamaClient } from '@anytime-markdown/agent-core';

const SCOPE = 'embedding_backfill';
const DEFAULT_EMBED_MODEL = 'bge-m3';
const PROGRESS_LOG_INTERVAL = 50;

export interface EmbeddingBackfillResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  items_skipped: number;
  items_failed: number;
}

function runId(startedAt: string): string {
  return createHash('sha1')
    .update(`${SCOPE}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
}

function recordFailedItem(db: MemoryDbConnection, itemKey: string, reason: string, detail: string): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [SCOPE, itemKey, failedAt, reason, detail]
  );
}

/**
 * Generates and stores embeddings for all memory_entities rows where
 * embedding IS NULL. Safe to run multiple times — already-embedded entities
 * are skipped.
 */
export async function runEmbeddingBackfill(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  embedModel?: string;
  logger?: MemoryLogger;
  /** 進捗 callback (total を初回・以降 processed/failed を更新) */
  onTotal?: (total: number) => void;
  progress?: (processed: number, failed: number) => void;
}): Promise<EmbeddingBackfillResult> {
  const { db, ollama, embedModel = DEFAULT_EMBED_MODEL, logger = noopLogger } = opts;
  const onTotal = opts.onTotal;
  const progress = opts.progress;

  const startedAt = new Date().toISOString();
  const id = runId(startedAt);

  // Count totals for logging
  const totalRows = db.exec('SELECT COUNT(*) FROM memory_entities WHERE embedding IS NULL');
  const totalNull = (totalRows[0]?.values[0]?.[0] as number) ?? 0;
  const totalSkipRows = db.exec('SELECT COUNT(*) FROM memory_entities WHERE embedding IS NOT NULL');
  const totalSkip = (totalSkipRows[0]?.values[0]?.[0] as number) ?? 0;

  logger.info(
    `[anytime-memory] embedding backfill: ${totalNull} to process, ${totalSkip} already embedded`
  );
  if (onTotal) onTotal(totalNull);

  // Start pipeline run
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, status, started_at, finished_at, duration_ms,
        items_processed, items_failed,
        entities_inserted, entities_updated, edges_inserted, edges_invalidated)
     VALUES (?, ?, 'running', ?, NULL, 0, 0, 0, 0, 0, 0, 0)`,
    [id, SCOPE, startedAt]
  );

  const counters = { processed: 0, failed: 0 };

  // Fetch all entity IDs with NULL embedding upfront
  const idRows = db.exec(
    'SELECT id, type, display_name, summary FROM memory_entities WHERE embedding IS NULL'
  );
  const entities = (idRows[0]?.values ?? []) as [string, string, string, string][];

  for (const [entityId, type, displayName, summary] of entities) {
    const text = summary
      ? `${type}: ${displayName}. ${summary}`
      : `${type}: ${displayName}`;

    try {
      const { embedding } = await ollama.embeddings({ model: embedModel, prompt: text });
      const blob = encodeEmbedding(embedding);
      db.run('UPDATE memory_entities SET embedding = ? WHERE id = ?', [blob, entityId]);
      db.run('DELETE FROM memory_failed_items WHERE scope = ? AND item_key = ?', [SCOPE, entityId]);
      counters.processed++;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      recordFailedItem(db, entityId, 'embedding_failed', detail);
      counters.failed++;
      logger.warn?.(`[anytime-memory] embedding backfill: failed entity ${entityId} — ${detail}`);
    }

    const done = counters.processed + counters.failed;
    if (done % PROGRESS_LOG_INTERVAL === 0) {
      logger.info(`[anytime-memory] embedding backfill progress: ${done}/${totalNull} (${counters.failed} failed)`);
      progress?.(counters.processed, counters.failed);
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
  const partialOrError: EmbeddingBackfillResult['status'] = counters.processed > 0 ? 'partial' : 'error';
  const status: EmbeddingBackfillResult['status'] =
    counters.failed === 0 ? 'success' : partialOrError;

  db.run(
    `UPDATE memory_pipeline_runs SET
       status          = ?,
       finished_at     = ?,
       duration_ms     = ?,
       items_processed = ?,
       items_failed    = ?
     WHERE id = ?`,
    [status, finishedAt, durationMs, counters.processed, counters.failed, id]
  );

  logger.info(
    `[anytime-memory] embedding backfill complete: status=${status}, processed=${counters.processed}, failed=${counters.failed}, duration=${durationMs}ms`
  );

  return {
    status,
    items_processed: counters.processed,
    items_skipped: totalSkip,
    items_failed: counters.failed,
  };
}
