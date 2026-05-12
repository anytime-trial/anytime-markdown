import { createHash } from 'crypto';
import type { MemoryDbConnection } from '../db/connection/types';
import { splitEpisodes } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { readMessagesSince } from '../ingest/conversation/readMessages';
import { episodeId, persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { noopLogger, type MemoryLogger } from '../logger';
import type { OllamaClient } from '../ollama/client';

const SCOPE = 'conversation_backfill';
const QUARANTINE_THRESHOLD = 3;
const DEFAULT_SINCE_DAYS = 5;
const PROGRESS_LOG_INTERVAL = 10;
const DEFAULT_EXTRACT_CONCURRENCY = 2;

function resolveExtractConcurrency(): number {
  const raw = process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
  if (raw === undefined || raw === '') return DEFAULT_EXTRACT_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_EXTRACT_CONCURRENCY;
  return Math.floor(n);
}

export interface BackfillResult {
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
  return createHash('sha1')
    .update(`${SCOPE}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
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
  // last_heartbeat_at is initialized to started_at so pipelineWatchdog has a
  // valid signal from the very first moment of the run.
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms, last_heartbeat_at)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
    [id, SCOPE, startedAt, startedAt]
  );
}

function updateHeartbeatAndProgress(
  db: MemoryDbConnection,
  id: string,
  totals: PersistStats & { items_processed: number; items_failed: number }
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

function computeSinceISO(db: MemoryDbConnection, sinceDays: number): string {
  const sinceFromDays = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const rows = db.exec(
    `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`,
    [SCOPE]
  );
  const lastProcessedAt = (rows[0]?.values?.[0]?.[0] as string | undefined) ?? '';
  // Resume from last_processed_at when it's set and newer than the sinceDays
  // window. This avoids re-scanning sessions whose episodes are already
  // persisted (existingIds still guards individual episodes, but skipping
  // sessions entirely saves splitEpisodes + DB scan cost).
  if (lastProcessedAt !== '' && lastProcessedAt > sinceFromDays) {
    return lastProcessedAt;
  }
  return sinceFromDays;
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
 * Backfill pipeline that re-reads messages from the last N days (default 7)
 * from the ATTACHed trail DB, splits them into episodes, runs LLM extraction,
 * and persists facts.
 *
 * Unlike the incremental pipeline, this always starts from `sinceDays` days ago
 * rather than reading from pipeline_state.last_processed_at.
 *
 * On success it also advances the incremental pipeline cursor so the incremental
 * run skips data that backfill already processed.
 *
 * The trail DB must already be ATTACHed as "trail" on `db` via
 * attachTrailDbFromHandle / attachTrailDbReadOnly before calling this function.
 */
export async function runConversationBackfill(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  sinceDays?: number;
  logger?: MemoryLogger;
  model?: string;
  /**
   * Persist the in-memory sql.js DB to the underlying file. Called at backfill
   * start, each session start, and every progress-log interval so a VS Code
   * reload mid-backfill loses at most PROGRESS_LOG_INTERVAL episodes of work.
   */
  save?: () => void;
}): Promise<BackfillResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const sinceDays = opts.sinceDays ?? DEFAULT_SINCE_DAYS;
  const extractConcurrency = resolveExtractConcurrency();

  const startedAt = new Date().toISOString();
  const rId = runId(startedAt);

  // ── 1. Compute sinceISO: max(sinceDays前, last_processed_at) ─────────────
  // Resume from last_processed_at when it's set, so re-runs after VS Code
  // reload don't re-scan sessions whose episodes are already in memory_episodes.
  const sinceISO = computeSinceISO(db, sinceDays);

  // ── 2. Insert pipeline_run + mark state as running ───────────────────────
  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

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
  // Pre-count sessions for progress display
  const sessionList = [...readMessagesSince(db, sinceISO)];
  const totalSessions = sessionList.length;
  const totalEpisodes = sessionList.reduce(
    (sum, { messages }) => sum + splitEpisodes(messages).length, 0
  );

  // Preload episode ids that already exist in memory_episodes (within sinceISO window).
  // When backfill is interrupted (VS Code reload, OS shutdown), persistEpisodeFacts
  // is idempotent but extractFactsFromEpisode is not — re-running the LLM extraction
  // on thousands of already-persisted episodes wastes ~10s/episode. Skipping them
  // makes the next backfill effectively a resume.
  const existingIds = new Set<string>();
  const existsRows = db.exec(
    `SELECT id FROM memory_episodes WHERE valid_from >= ?`,
    [sinceISO]
  );
  for (const row of existsRows[0]?.values ?? []) {
    existingIds.add(row[0] as string);
  }

  const toProcess = totalEpisodes - existingIds.size;
  logger.info(
    `[memory-core] backfill: ${totalSessions} sessions, ${totalEpisodes} episodes ` +
    `(${existingIds.size} already persisted, ${toProcess} to process, since ${sinceDays}d ago)`
  );
  updateHeartbeatAndProgress(db, rId, totals);
  save?.();

  let sessionIdx = 0;
  try {
    for (const { session_id, messages } of sessionList) {
      sessionIdx += 1;
      const episodes = splitEpisodes(messages);
      logger.info(
        `[memory-core] backfill: session ${sessionIdx}/${totalSessions} — ${session_id.slice(0, 12)} (${episodes.length} episodes)`
      );
      updateHeartbeatAndProgress(db, rId, totals);
      save?.();

      // Partition episodes into skipped (already in DB) and to-extract.
      // Doing this up-front lets us batch the LLM calls below.
      const toExtract: typeof episodes = [];
      for (const episode of episodes) {
        const epId = episodeId(episode.session_id, episode.message_uuid_start);
        if (existingIds.has(epId)) {
          totals.items_skipped += 1;
          if (episode.valid_from > maxTimestamp) {
            maxTimestamp = episode.valid_from;
          }
        } else {
          toExtract.push(episode);
        }
      }

      // Concurrent extraction (LLM I/O bound) + serial persist (sql.js is
      // single-threaded WASM, not thread-safe). With CONCURRENCY=1 this is
      // equivalent to the previous serial behavior.
      for (let batchStart = 0; batchStart < toExtract.length; batchStart += extractConcurrency) {
        const batch = toExtract.slice(batchStart, batchStart + extractConcurrency);
        const recordedAt = new Date().toISOString();

        const extracted = await Promise.all(
          batch.map(async (ep) => {
            try {
              return await extractFactsFromEpisode({
                ollama,
                episode: {
                  raw_excerpt: ep.raw_excerpt,
                  session_id: ep.session_id,
                  message_uuid_start: ep.message_uuid_start,
                  message_uuid_end: ep.message_uuid_end,
                  valid_from: ep.valid_from,
                },
                model,
                logger,
              });
            } catch (err) {
              logger.error(
                `[memory-core] runConversationBackfill: unexpected error in extractFacts for episode ${ep.message_uuid_start}`,
                err
              );
              return null;
            }
          })
        );

        // Serial persist + bookkeeping. consecutiveFailures advances by 1 per
        // failed episode within the batch, mirroring the prior serial flow.
        for (let j = 0; j < batch.length; j++) {
          const episode = batch[j];
          const ex = extracted[j];

          totals.items_processed += 1;
          if (episode.valid_from > maxTimestamp) {
            maxTimestamp = episode.valid_from;
          }

          // Progress log every PROGRESS_LOG_INTERVAL episodes
          if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
            logger.info(
              `[memory-core] backfill progress: ${totals.items_processed}/${toProcess} episodes processed (${totals.items_skipped} skipped)`
            );
            updateHeartbeatAndProgress(db, rId, totals);
            save?.();
          }

          if (ex === null) {
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
                `[memory-core] runConversationBackfill: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
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
              extracted: ex,
              recordedAt,
              logger,
            });
            totals.entities_inserted += persisted.entities_inserted;
            totals.entities_updated += persisted.entities_updated;
            totals.edges_inserted += persisted.edges_inserted;
            totals.edges_invalidated += persisted.edges_invalidated;
          } catch (err) {
            logger.error(
              `[memory-core] runConversationBackfill: persist failed for episode ${episode.message_uuid_start}`,
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
      }

      // After each session, advance last_processed_at so a future resume
      // (VS Code reload, OS shutdown) can skip already-processed sessions
      // via computeSinceISO() instead of re-scanning from sinceDays ago.
      upsertPipelineState(db, {
        status: 'running',
        last_processed_at: maxTimestamp,
      });
    }
  } catch (err) {
    logger.error(
      `[memory-core] runConversationBackfill: fatal error during session iteration`,
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
  const nextSince =
    maxTimestamp === sinceISO
      ? sinceISO
      : new Date(new Date(maxTimestamp).getTime() + 1).toISOString();

  // Update backfill pipeline state
  upsertPipelineState(db, {
    status: 'idle',
    last_processed_at: nextSince,
  });

  // Also advance incremental cursor so it skips backfilled data
  db.run(
    `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES ('conversation_incremental', 'idle', ?, '')
     ON CONFLICT(scope) DO UPDATE SET
       last_processed_at = CASE
         WHEN last_processed_at < excluded.last_processed_at THEN excluded.last_processed_at
         ELSE last_processed_at
       END`,
    [nextSince]
  );

  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return { status: finalStatus, ...totals };
}
