import { createHash } from 'crypto';
import type { MemoryDbConnection } from '../db/connection/types';
import { splitEpisodes, type Message } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { noopLogger, type MemoryLogger } from '../logger';
import type { OllamaClient } from '../ollama/client';

const RETRY_SCOPE = 'conversation_failed_items_retry';
const DEFAULT_SOURCE_SCOPE = 'conversation_backfill';
const DEFAULT_MAX_ATTEMPTS = 3;
const QUARANTINE_THRESHOLD = 3;
const PROGRESS_LOG_INTERVAL = 5;
const DEFAULT_EXTRACT_CONCURRENCY = 2;

function resolveMaxAttempts(): number {
  const raw = process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
  if (raw === undefined || raw === '') return DEFAULT_MAX_ATTEMPTS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_ATTEMPTS;
  return Math.floor(n);
}

function resolveExtractConcurrency(): number {
  const raw = process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
  if (raw === undefined || raw === '') return DEFAULT_EXTRACT_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_EXTRACT_CONCURRENCY;
  return Math.floor(n);
}

function runId(startedAt: string): string {
  return createHash('sha1')
    .update(`${RETRY_SCOPE}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
}

interface FailedItemRow {
  scope: string;
  item_key: string;
  attempt_count: number;
}

interface ReconstructedEpisode {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

function loadFailedItems(db: MemoryDbConnection, sourceScope: string, maxAttempts: number): FailedItemRow[] {
  const rows = db.exec(
    `SELECT scope, item_key, attempt_count
     FROM memory_failed_items
     WHERE scope = ? AND reason IN ('extraction_failed', 'persist_failed', 'episode_not_found')
       AND attempt_count < ?
     ORDER BY failed_at ASC`,
    [sourceScope, maxAttempts]
  );
  if (rows.length === 0) return [];
  return (rows[0].values ?? []).map((r) => ({
    scope: r[0] as string,
    item_key: r[1] as string,
    attempt_count: r[2] as number,
  }));
}

function parseItemKey(item_key: string): { session_id: string; message_uuid_start: string } | null {
  // item_key format: "<session_id>:<message_uuid_start>" — both are UUIDs.
  const idx = item_key.indexOf(':');
  if (idx < 0) return null;
  return {
    session_id: item_key.slice(0, idx),
    message_uuid_start: item_key.slice(idx + 1),
  };
}

function reconstructEpisode(
  db: MemoryDbConnection,
  session_id: string,
  message_uuid_start: string,
): ReconstructedEpisode | null {
  // ATTACHed trail DB から該当 session の messages を取得し、splitEpisodes で
  // 元 episode を再構築する。message_uuid_start が一致する episode を返す。
  const rows = db.exec(
    `SELECT m.uuid, m.session_id, m.type, m.timestamp,
            COALESCE(SUBSTR(m.text_content, 1, 2048),
                     SUBSTR(m.user_content, 1, 2048),
                     '') AS text_excerpt
     FROM trail.messages m
     WHERE m.session_id = ? AND m.timestamp IS NOT NULL
       AND m.type IN ('user', 'assistant', 'system')
     ORDER BY m.timestamp`,
    [session_id]
  );
  if (rows.length === 0 || !rows[0].values || rows[0].values.length === 0) return null;
  const messages: Message[] = [];
  for (const r of rows[0].values) {
    const t = r[2] as string;
    if (t !== 'user' && t !== 'assistant' && t !== 'system') continue;
    messages.push({
      uuid: r[0] as string,
      session_id: r[1] as string,
      type: t,
      timestamp: r[3] as string,
      text_excerpt: (r[4] as string | null) ?? '',
    });
  }
  const eps = splitEpisodes(messages);
  return eps.find((e) => e.message_uuid_start === message_uuid_start) ?? null;
}

function deleteFailedItem(db: MemoryDbConnection, scope: string, item_key: string): void {
  db.run(
    `DELETE FROM memory_failed_items WHERE scope = ? AND item_key = ?`,
    [scope, item_key]
  );
}

function recordFailedItem(
  db: MemoryDbConnection,
  scope: string,
  item_key: string,
  reason: string,
  detail: string,
): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       reason        = excluded.reason,
       detail        = excluded.detail`,
    [scope, item_key, failedAt, reason, detail]
  );
}

function upsertPipelineState(
  db: MemoryDbConnection,
  opts: { status: string; error_detail?: string },
): void {
  const { status, error_detail } = opts;
  db.run(
    `INSERT INTO memory_pipeline_state
       (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, '', ?)
     ON CONFLICT(scope) DO UPDATE SET
       status       = excluded.status,
       error_detail = excluded.error_detail`,
    [RETRY_SCOPE, status, error_detail ?? '']
  );
}

function insertPipelineRun(db: MemoryDbConnection, id: string, startedAt: string): void {
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms, last_heartbeat_at)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
    [id, RETRY_SCOPE, startedAt, startedAt]
  );
}

function updateHeartbeatAndProgress(
  db: MemoryDbConnection,
  id: string,
  totals: PersistStats & { items_processed: number; items_failed: number },
): void {
  db.run(
    `UPDATE memory_pipeline_runs SET
       last_heartbeat_at = ?,
       items_processed   = ?,
       entities_inserted = ?,
       entities_updated  = ?,
       edges_inserted    = ?,
       edges_invalidated = ?,
       items_failed      = ?
     WHERE id = ?`,
    [
      new Date().toISOString(),
      totals.items_processed,
      totals.entities_inserted,
      totals.entities_updated,
      totals.edges_inserted,
      totals.edges_invalidated,
      totals.items_failed,
      id,
    ]
  );
}

function finalizePipelineRun(
  db: MemoryDbConnection,
  id: string,
  startedAt: string,
  status: 'success' | 'partial' | 'error',
  totals: PersistStats & { items_processed: number; items_failed: number },
): void {
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();
  db.run(
    `UPDATE memory_pipeline_runs SET
       finished_at       = ?,
       status            = ?,
       items_processed   = ?,
       entities_inserted = ?,
       entities_updated  = ?,
       edges_inserted    = ?,
       edges_invalidated = ?,
       items_failed      = ?,
       duration_ms       = ?
     WHERE id = ?`,
    [
      finishedAt,
      status,
      totals.items_processed,
      totals.entities_inserted,
      totals.entities_updated,
      totals.edges_inserted,
      totals.edges_invalidated,
      totals.items_failed,
      durationMs,
      id,
    ]
  );
}

export interface FailedItemsRetryResult {
  status: 'success' | 'partial' | 'error';
  items_retried: number;
  items_recovered: number;
  items_failed: number;
}

/**
 * Re-runs LLM extraction on previously failed episodes recorded in
 * memory_failed_items. Each item_key is split into (session_id, message_uuid_start),
 * the original episode is reconstructed from the ATTACHed trail.db, and the
 * extraction is retried. On success the failed_items row is DELETEd; on failure
 * attempt_count is incremented (existing ON CONFLICT path).
 *
 * Items with attempt_count >= maxAttempts (default 3) are skipped — they require
 * human intervention.
 *
 * The ATTACHed trail.db must already be present as alias "trail" before calling.
 */
export async function runConversationFailedItemsRetry(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  logger?: MemoryLogger;
  model?: string;
  maxAttempts?: number;
  sourceScope?: string;
  save?: () => void;
}): Promise<FailedItemsRetryResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const maxAttempts = opts.maxAttempts ?? resolveMaxAttempts();
  const sourceScope = opts.sourceScope ?? DEFAULT_SOURCE_SCOPE;
  const extractConcurrency = resolveExtractConcurrency();

  const startedAt = new Date().toISOString();
  const rId = runId(startedAt);

  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

  const items = loadFailedItems(db, sourceScope, maxAttempts);
  const totals: PersistStats & { items_processed: number; items_failed: number } = {
    items_processed: 0,
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    items_failed: 0,
  };
  let recoveredCount = 0;
  let consecutiveFailures = 0;
  let finalStatus: 'success' | 'partial' | 'error' = 'success';

  if (items.length === 0) {
    logger.info(
      `[memory-core] failed-items retry: no items to retry (source=${sourceScope}, maxAttempts=${maxAttempts})`
    );
    upsertPipelineState(db, { status: 'idle' });
    finalizePipelineRun(db, rId, startedAt, 'success', totals);
    return { status: 'success', items_retried: 0, items_recovered: 0, items_failed: 0 };
  }

  logger.info(
    `[memory-core] failed-items retry: ${items.length} items to retry (source=${sourceScope})`
  );

  try {
    for (let batchStart = 0; batchStart < items.length; batchStart += extractConcurrency) {
      const batch = items.slice(batchStart, batchStart + extractConcurrency);

      const episodes: (ReconstructedEpisode | null)[] = batch.map((item) => {
        const parsed = parseItemKey(item.item_key);
        if (!parsed) return null;
        return reconstructEpisode(db, parsed.session_id, parsed.message_uuid_start);
      });

      const extracted = await Promise.all(
        batch.map(async (item, i) => {
          const ep = episodes[i];
          if (!ep) return null;
          try {
            return await extractFactsFromEpisode({
              ollama,
              episode: ep,
              model,
              logger,
            });
          } catch (err) {
            logger.error(
              `[memory-core] failed-items retry: extractFactsFromEpisode error for ${item.item_key}`,
              err
            );
            return null;
          }
        })
      );

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const ep = episodes[j];
        const ex = extracted[j];

        totals.items_processed += 1;

        if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
          logger.info(
            `[memory-core] failed-items retry progress: ${totals.items_processed}/${items.length}`
          );
          updateHeartbeatAndProgress(db, rId, totals);
          save?.();
        }

        // Case 1: episode could not be reconstructed (trail.db missing data, malformed key)
        if (!ep) {
          totals.items_failed += 1;
          consecutiveFailures += 1;
          recordFailedItem(
            db,
            item.scope,
            item.item_key,
            'episode_not_found',
            `episode not reconstructed from trail.db for ${item.item_key}`
          );
          if (consecutiveFailures >= QUARANTINE_THRESHOLD) {
            logger.error(
              `[memory-core] failed-items retry: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
            );
            upsertPipelineState(db, {
              status: 'quarantine',
              error_detail: `${QUARANTINE_THRESHOLD} consecutive failures`,
            });
            finalizePipelineRun(db, rId, startedAt, 'partial', totals);
            return {
              status: 'partial',
              items_retried: totals.items_processed,
              items_recovered: recoveredCount,
              items_failed: totals.items_failed,
            };
          }
          continue;
        }

        // Case 2: extraction returned null (LLM failure, schema violation)
        if (ex === null) {
          totals.items_failed += 1;
          consecutiveFailures += 1;
          recordFailedItem(
            db,
            item.scope,
            item.item_key,
            'extraction_failed',
            `retry attempt ${item.attempt_count + 1} failed`
          );
          if (consecutiveFailures >= QUARANTINE_THRESHOLD) {
            logger.error(
              `[memory-core] failed-items retry: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
            );
            upsertPipelineState(db, {
              status: 'quarantine',
              error_detail: `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
            });
            finalizePipelineRun(db, rId, startedAt, 'partial', totals);
            return {
              status: 'partial',
              items_retried: totals.items_processed,
              items_recovered: recoveredCount,
              items_failed: totals.items_failed,
            };
          }
          continue;
        }

        // Case 3: extraction succeeded → persist + remove from failed_items
        consecutiveFailures = 0;
        const recordedAt = new Date().toISOString();
        try {
          const persisted = persistEpisodeFacts({
            db,
            episode: ep,
            extracted: ex,
            recordedAt,
            logger,
          });
          totals.entities_inserted += persisted.entities_inserted;
          totals.entities_updated += persisted.entities_updated;
          totals.edges_inserted += persisted.edges_inserted;
          totals.edges_invalidated += persisted.edges_invalidated;
          deleteFailedItem(db, item.scope, item.item_key);
          recoveredCount += 1;
        } catch (err) {
          logger.error(
            `[memory-core] failed-items retry: persist failed for ${item.item_key}`,
            err
          );
          totals.items_failed += 1;
          recordFailedItem(
            db,
            item.scope,
            item.item_key,
            'persist_failed',
            err instanceof Error ? (err.stack ?? err.message) : String(err)
          );
        }
      }
    }
  } catch (err) {
    logger.error(`[memory-core] failed-items retry: fatal error during iteration`, err);
    finalStatus = 'error';
    upsertPipelineState(db, {
      status: 'error',
      error_detail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    finalizePipelineRun(db, rId, startedAt, 'error', totals);
    return {
      status: 'error',
      items_retried: totals.items_processed,
      items_recovered: recoveredCount,
      items_failed: totals.items_failed,
    };
  }

  upsertPipelineState(db, { status: 'idle' });
  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return {
    status: finalStatus,
    items_retried: totals.items_processed,
    items_recovered: recoveredCount,
    items_failed: totals.items_failed,
  };
}
