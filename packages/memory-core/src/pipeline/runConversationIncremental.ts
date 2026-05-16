import { createHash } from 'crypto';
import type { MemoryDbConnection } from '../db/connection/types';
import { splitEpisodes } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { readMessagesSince } from '../ingest/conversation/readMessages';
import { episodeId, persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { noopLogger, type MemoryLogger } from '../logger';
import type { OllamaClient } from '@anytime-markdown/ollama-core';

const SCOPE = 'conversation_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const QUARANTINE_THRESHOLD = 3;
const PROGRESS_LOG_INTERVAL = 50;

export interface IncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  items_skipped: number;
  entities_inserted: number;
  entities_updated: number;
  edges_inserted: number;
  edges_invalidated: number;
  items_failed: number;
}

function runId(startedAt: string): string {
  // better-sqlite3 移行で 1 プロセス内 2 連続実行が同一 ms に着地して UNIQUE
  // 衝突するケースが出たため、nonce (高精度時刻) を加えてユニーク性を確保する。
  const nonce = process.hrtime.bigint().toString(36);
  return createHash('sha1')
    .update(`${SCOPE}:${startedAt}:${nonce}`)
    .digest('hex')
    .slice(0, 16);
}

function readPipelineState(db: MemoryDbConnection): {
  last_processed_at: string;
  status: string;
} {
  const stmt = db.prepare(
    `SELECT last_processed_at, status FROM memory_pipeline_state WHERE scope = ?`
  );
  try {
    const row = stmt.get(SCOPE);
    if (row) {
      return {
        last_processed_at: (row['last_processed_at'] as string) || DEFAULT_SINCE,
        status: (row['status'] as string) || 'idle',
      };
    }
    return { last_processed_at: DEFAULT_SINCE, status: 'idle' };
  } finally {
    stmt.free?.();
  }
}

function upsertPipelineState(
  db: MemoryDbConnection,
  opts: {
    status: string;
    last_processed_at?: string;
    error_detail?: string;
  }
): void {
  const { status, last_processed_at, error_detail } = opts;
  db.run(
    `INSERT INTO memory_pipeline_state
       (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail      = excluded.error_detail`,
    [SCOPE, status, last_processed_at ?? '', error_detail ?? '']
  );
}

function insertPipelineRun(
  db: MemoryDbConnection,
  id: string,
  startedAt: string
): void {
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, SCOPE, startedAt]
  );
}

function updatePipelineRunProgress(
  db: MemoryDbConnection,
  id: string,
  totals: PersistStats & { items_processed: number; items_failed: number }
): void {
  db.run(
    `UPDATE memory_pipeline_runs SET
       items_processed   = ?,
       entities_inserted = ?,
       entities_updated  = ?,
       edges_inserted    = ?,
       edges_invalidated = ?,
       items_failed      = ?
     WHERE id = ?`,
    [
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
  totals: PersistStats & { items_processed: number; items_failed: number }
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
 * Incremental pipeline that reads new messages from the ATTACHed trail DB,
 * splits them into episodes, runs LLM extraction, and persists facts.
 *
 * The trail DB must already be ATTACHed as "trail" on `db` via
 * attachTrailDbFromHandle / attachTrailDbReadOnly before calling this function.
 */
export async function runConversationIncremental(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  logger?: MemoryLogger;
  model?: string;
  /** 進捗チェックポイント時に呼ばれる save コールバック (sql.js memDb の disk 書き込み)。 */
  save?: () => void;
  /** 進捗チェックポイント時に呼ばれる progress callback (TreeView 表示用)。 */
  progress?: (processed: number, failed: number) => void;
}): Promise<IncrementalResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const progress = opts.progress;

  const startedAt = new Date().toISOString();
  const rId = runId(startedAt);

  // ── 1. Read pipeline state ───────────────────────────────────────────────
  const { last_processed_at } = readPipelineState(db);
  const sinceISO = last_processed_at || DEFAULT_SINCE;

  // ── 2. Insert pipeline_run + mark state as running ───────────────────────
  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

  // Preload episode ids already in memory_episodes within the sinceISO window.
  // When a previous run was interrupted (VS Code reload mid-pipeline),
  // persistEpisodeFacts is idempotent but extractFactsFromEpisode is not —
  // re-feeding already-persisted episodes to Ollama wastes minutes per episode.
  const existingIds = new Set<string>();
  const existsRows = db.exec(
    `SELECT id FROM memory_episodes WHERE valid_from >= ?`,
    [sinceISO]
  );
  for (const row of existsRows[0]?.values ?? []) {
    existingIds.add(row[0] as string);
  }

  // Accumulators
  const totals: PersistStats & {
    items_processed: number;
    items_skipped: number;
    items_failed: number;
  } = {
    items_processed: 0,
    items_skipped: 0,
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    items_failed: 0,
  };

  let maxTimestamp = sinceISO;
  let consecutiveFailures = 0;
  let finalStatus: 'success' | 'partial' | 'error' = 'success';

  // ── 3. Iterate sessions ──────────────────────────────────────────────────
  try {
    for (const { messages } of readMessagesSince(db, sinceISO)) {
      const episodes = splitEpisodes(messages);

      for (const episode of episodes) {
        // Track latest timestamp seen (used for cursor advancement at session
        // boundary). Counted for every episode, even when skipped, so the
        // cursor still moves forward on resume.
        if (episode.valid_from > maxTimestamp) {
          maxTimestamp = episode.valid_from;
        }

        // Skip episodes that were already persisted by a prior run. Resume
        // after a VS Code reload: persistEpisodeFacts is idempotent, but
        // extractFactsFromEpisode is not — re-running the LLM extraction on
        // already-done episodes wastes minutes per episode.
        const epId = episodeId(episode.session_id, episode.message_uuid_start);
        if (existingIds.has(epId)) {
          totals.items_skipped += 1;
          continue;
        }

        totals.items_processed += 1;

        if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
          logger.info(
            `[anytime-memory] conversation incremental progress: ${totals.items_processed} processed ` +
              `(${totals.items_failed} failed, ${totals.items_skipped} skipped, ` +
              `entities_inserted=${totals.entities_inserted})`
          );
          // Persist items_processed (and other run counters) to DB BEFORE
          // save() so the disk snapshot reflects the checkpoint. Cursor
          // advancement happens at session boundary, not here, because
          // session_id ordering ≠ timestamp ordering (UUIDs) — advancing
          // mid-session could skip ahead of later-iterated sessions with
          // earlier timestamps.
          updatePipelineRunProgress(db, rId, totals);
          if (save) {
            const t0 = Date.now();
            save();
            logger.info(`[anytime-memory] conversation incremental: checkpoint save ${Date.now() - t0}ms`);
          }
          if (progress) progress(totals.items_processed, totals.items_failed);
        }

        const recordedAt = new Date().toISOString();

        let extracted;
        try {
          extracted = await extractFactsFromEpisode({
            ollama,
            episode: {
              raw_excerpt: episode.raw_excerpt,
              session_id: episode.session_id,
              message_uuid_start: episode.message_uuid_start,
              message_uuid_end: episode.message_uuid_end,
              valid_from: episode.valid_from,
            },
            model,
            logger,
          });
        } catch (err) {
          logger.error(
            `[anytime-memory] runConversationIncremental: unexpected error in extractFacts for episode ${episode.message_uuid_start}`,
            err
          );
          extracted = null;
        }

        if (extracted === null) {
          totals.items_failed += 1;
          consecutiveFailures += 1;
          recordFailedItem(
            db,
            `${episode.session_id}:${episode.message_uuid_start}`,
            'extraction_failed',
            `episode ${episode.message_uuid_start} in session ${episode.session_id}`
          );

          if (consecutiveFailures >= QUARANTINE_THRESHOLD) {
            logger.error(
              `[anytime-memory] runConversationIncremental: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
            );
            upsertPipelineState(db, {
              status: 'quarantine',
              last_processed_at: maxTimestamp,
              error_detail: `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
            });
            finalizePipelineRun(db, rId, startedAt, 'partial', totals);
            return {
              status: 'partial',
              ...totals,
            };
          }
          continue;
        }

        // Reset consecutive failure counter on success
        consecutiveFailures = 0;

        try {
          const persisted = persistEpisodeFacts({
            db,
            episode,
            extracted,
            recordedAt,
            logger,
          });
          totals.entities_inserted += persisted.entities_inserted;
          totals.entities_updated += persisted.entities_updated;
          totals.edges_inserted += persisted.edges_inserted;
          totals.edges_invalidated += persisted.edges_invalidated;
        } catch (err) {
          logger.error(
            `[anytime-memory] runConversationIncremental: persist failed for episode ${episode.message_uuid_start}`,
            err
          );
          totals.items_failed += 1;
          recordFailedItem(
            db,
            `${episode.session_id}:${episode.message_uuid_start}`,
            'persist_failed',
            err instanceof Error ? (err.stack ?? err.message) : String(err)
          );
        }
      }

      // After each session, advance last_processed_at so a future resume
      // (VS Code reload, OS shutdown) can skip already-processed sessions
      // and convTotalEstimate decreases to reflect completed work.
      upsertPipelineState(db, {
        status: 'running',
        last_processed_at: maxTimestamp,
      });
    }
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationIncremental: fatal error during session iteration`,
      err
    );
    finalStatus = 'error';
    upsertPipelineState(db, {
      status: 'error',
      last_processed_at: maxTimestamp,
      error_detail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    finalizePipelineRun(db, rId, startedAt, 'error', totals);
    return { status: 'error', ...totals };
  }

  // ── 4. Finalize ──────────────────────────────────────────────────────────
  // Advance maxTimestamp by 1 ms so that next run uses an exclusive lower bound
  // (the query uses >=, so incrementing prevents reprocessing the last episode).
  const nextSince =
    maxTimestamp === sinceISO
      ? sinceISO // no new messages were processed — keep the same cursor
      : new Date(new Date(maxTimestamp).getTime() + 1).toISOString();

  upsertPipelineState(db, {
    status: 'idle',
    last_processed_at: nextSince,
  });
  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return { status: finalStatus, ...totals };
}
