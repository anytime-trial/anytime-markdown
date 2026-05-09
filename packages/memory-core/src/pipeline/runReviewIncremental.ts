import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'sql.js';
import { parseReviewDoc } from '../ingest/review/parseReviewDoc';
import { parseReviewSessions } from '../ingest/review/parseReviewSession';
import { refineCategories } from '../ingest/review/extractFindings';
import { upsertReviewDoc, upsertReviewSession } from '../ingest/review/persist';
import { linkAddresses } from '../ingest/review/linkAddresses';
import { linkPrecedesBugs } from '../ingest/review/linkPrecedesBugs';
import type { OllamaClient } from '../ollama/client';
import { noopLogger, type MemoryLogger } from '../logger';

const SCOPE_DOC = 'review_incremental';
const SCOPE_SESSION = 'review_session_incremental';
const DEFAULT_REVIEW_DIR = '/Shared/anytime-markdown-docs/review';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';

export interface ReviewIncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  reviews_inserted: number;
  findings_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

// ── Private helpers (same pattern as runBugHistoryIncremental.ts) ─────────────

function readPipelineState(db: Database, scope: string): string {
  const stmt = db.prepare(`SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`);
  stmt.bind([scope]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return (row['last_processed_at'] as string) || DEFAULT_SINCE;
  }
  stmt.free();
  return DEFAULT_SINCE;
}

function upsertPipelineState(
  db: Database,
  scope: string,
  opts: { status: string; last_processed_at?: string; error_detail?: string },
): void {
  db.run(
    `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail = excluded.error_detail`,
    [scope, opts.status, opts.last_processed_at ?? '', opts.error_detail ?? ''],
  );
}

function insertPipelineRun(db: Database, id: string, scope: string, startedAt: string): void {
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, scope, startedAt],
  );
}

function finalizePipelineRun(
  db: Database,
  id: string,
  startedAt: string,
  status: 'success' | 'partial' | 'error',
  totals: { items_processed: number; entities_inserted: number; edges_inserted: number },
): void {
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();
  db.run(
    `UPDATE memory_pipeline_runs SET
       finished_at       = ?,
       status            = ?,
       items_processed   = ?,
       entities_inserted = ?,
       edges_inserted    = ?,
       duration_ms       = ?
     WHERE id = ?`,
    [
      finishedAt,
      status,
      totals.items_processed,
      totals.entities_inserted,
      totals.edges_inserted,
      durationMs,
      id,
    ],
  );
}

function recordFailedItem(
  db: Database,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string,
): void {
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [scope, itemKey, new Date().toISOString(), reason, detail],
  );
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runReviewIncremental(input: {
  db: Database;
  repoName: string;
  reviewDir?: string;
  ollama: OllamaClient;
  model?: string;
  logger?: MemoryLogger;
}): Promise<ReviewIncrementalResult> {
  const { db, repoName, ollama } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? 'qwen3.5:9b';
  const reviewDir =
    input.reviewDir ?? process.env['MEMORY_CORE_REVIEW_DIR'] ?? DEFAULT_REVIEW_DIR;

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const runIdHash = createHash('sha1')
    .update(`${SCOPE_DOC}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);

  insertPipelineRun(db, runIdHash, SCOPE_DOC, startedAt);
  upsertPipelineState(db, SCOPE_DOC, { status: 'running' });

  const totals = {
    items_processed: 0,
    entities_inserted: 0,
    edges_inserted: 0,
  };
  let reviewsInserted = 0;
  let findingsInserted = 0;
  let itemsFailed = 0;
  const recordedAt = new Date().toISOString();

  // ── Route A: doc files ────────────────────────────────────────────────────

  if (fs.existsSync(reviewDir)) {
    let mdFiles: string[];
    try {
      mdFiles = fs
        .readdirSync(reviewDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(reviewDir, f));
    } catch (err) {
      logger.error(`[memory-core] runReviewIncremental: failed to list reviewDir=${reviewDir}`, err);
      mdFiles = [];
    }

    for (const filePath of mdFiles) {
      const relPath = path.relative(path.dirname(reviewDir), filePath);
      totals.items_processed += 1;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const sha1 = createHash('sha1').update(content).digest('hex').slice(0, 16);

        // Check existing source_hash
        const existingRows = db.exec(
          `SELECT source_hash FROM memory_reviews WHERE source_kind='review_doc' AND source_ref=?`,
          [relPath],
        );
        const existingHash =
          existingRows[0]?.values?.[0]?.[0] != null
            ? String(existingRows[0].values[0][0])
            : null;

        if (existingHash !== null && existingHash === sha1) {
          // Already processed, hash unchanged — skip
          logger.info(`[memory-core] runReviewIncremental: skip unchanged file=${relPath}`);
          continue;
        }

        const doc = parseReviewDoc({ rel_path: relPath, content });
        if (doc === null) {
          // Not a review doc (e.g. type: spec) — skip silently
          logger.info(`[memory-core] runReviewIncremental: not a review doc, skip=${relPath}`);
          continue;
        }

        // Refine categories via LLM
        const refined = await refineCategories({
          findings: doc.findings,
          ollama,
          model,
          logger: {
            warn: (msg: string) => logger.info(msg),
          },
        });
        doc.findings.splice(0, doc.findings.length, ...refined.findings);

        const result = upsertReviewDoc(db, doc, relPath, sha1, recordedAt, logger);
        if (result.is_new) {
          reviewsInserted += 1;
          totals.entities_inserted += 1;
        }
        findingsInserted += result.findings_inserted;
        totals.edges_inserted += result.edges_inserted;
      } catch (err) {
        const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
        logger.error(
          `[memory-core] runReviewIncremental: failed to process file=${filePath}`,
          err,
        );
        recordFailedItem(db, SCOPE_DOC, relPath, 'parse_error', detail);
        itemsFailed += 1;
      }
    }
  } else {
    logger.info(
      `[memory-core] runReviewIncremental: reviewDir does not exist, skipping Route A (dir=${reviewDir})`,
    );
  }

  // ── Route B: sessions ─────────────────────────────────────────────────────

  try {
    const lastProcessedAt = readPipelineState(db, SCOPE_SESSION);

    const sessions = parseReviewSessions({
      db,
      sinceISO: lastProcessedAt,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });

    let maxReviewedAt = lastProcessedAt;

    for (const session of sessions) {
      totals.items_processed += 1;
      try {
        const refined = await refineCategories({
          findings: session.findings,
          ollama,
          model,
          logger: {
            warn: (msg: string) => logger.info(msg),
          },
        });
        session.findings.splice(0, session.findings.length, ...refined.findings);

        const result = upsertReviewSession(db, session, recordedAt, logger);
        if (result.is_new) {
          reviewsInserted += 1;
          totals.entities_inserted += 1;
        }
        findingsInserted += result.findings_inserted;
        totals.edges_inserted += result.edges_inserted;

        if (session.reviewed_at > maxReviewedAt) {
          maxReviewedAt = session.reviewed_at;
        }
      } catch (err) {
        const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
        logger.error(
          `[memory-core] runReviewIncremental: failed to process session=${session.session_id}`,
          err,
        );
        recordFailedItem(
          db,
          SCOPE_SESSION,
          `${session.session_id}#${session.message_uuid_start}`,
          'session_error',
          detail,
        );
        itemsFailed += 1;
      }
    }

    if (sessions.length > 0) {
      upsertPipelineState(db, SCOPE_SESSION, {
        last_processed_at: maxReviewedAt,
        status: 'idle',
      });
    }
  } catch (err) {
    logger.error(`[memory-core] runReviewIncremental: Route B failed`, err);
    itemsFailed += 1;
  }

  // ── Post-processing: linkAddresses + linkPrecedesBugs ─────────────────────

  try {
    const linkResult = linkAddresses({
      db,
      repoName,
      windowDays: 30,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });
    totals.edges_inserted += linkResult.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runReviewIncremental: linkAddresses failed`, err);
  }

  try {
    const precedesResult = linkPrecedesBugs({
      db,
      windowDays: 60,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });
    totals.edges_inserted += precedesResult.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runReviewIncremental: linkPrecedesBugs failed`, err);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  const finalStatus: 'success' | 'partial' | 'error' =
    itemsFailed > 0 && totals.items_processed === itemsFailed
      ? 'error'
      : itemsFailed > 0
        ? 'partial'
        : 'success';

  upsertPipelineState(db, SCOPE_DOC, { status: 'idle' });
  finalizePipelineRun(db, runIdHash, startedAt, finalStatus, totals);

  const durationMs = Date.now() - startMs;

  logger.info(
    `[memory-core] runReviewIncremental: done status=${finalStatus}, items_processed=${totals.items_processed}, ` +
      `reviews_inserted=${reviewsInserted}, findings_inserted=${findingsInserted}, ` +
      `edges_inserted=${totals.edges_inserted}, duration_ms=${durationMs}`,
  );

  return {
    status: finalStatus,
    items_processed: totals.items_processed,
    reviews_inserted: reviewsInserted,
    findings_inserted: findingsInserted,
    edges_inserted: totals.edges_inserted,
    duration_ms: durationMs,
  };
}
