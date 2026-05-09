import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import type { Database } from 'sql.js';
import { fromTrailGraph } from '../ingest/code/fromTrailGraph';
import { ingestAstFacts } from '../ingest/code/astFunctionLevel';
import { extractDecisionComments } from '../ingest/code/extractComments';
import { extractCommitRationale } from '../ingest/code/extractCommitRationale';
import { noopLogger, type MemoryLogger } from '../logger';
import * as ts from 'typescript';
import { analyzeWithProgram } from '@anytime-markdown/trail-core/analyze';

const SCOPE = 'code_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';

export interface CodeIncrementalResult {
  status: 'success' | 'partial' | 'error' | 'skipped';
  items_processed: number;
  entities_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

function runId(startedAt: string): string {
  return createHash('sha1')
    .update(`${SCOPE}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
}

function readPipelineState(db: Database): { last_processed_at: string } {
  const stmt = db.prepare(
    `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`
  );
  stmt.bind([SCOPE]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return { last_processed_at: (row['last_processed_at'] as string) || DEFAULT_SINCE };
  }
  stmt.free();
  return { last_processed_at: DEFAULT_SINCE };
}

function upsertPipelineState(
  db: Database,
  opts: { status: string; last_processed_at?: string; error_detail?: string }
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

function insertPipelineRun(db: Database, id: string, startedAt: string): void {
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

function finalizePipelineRun(
  db: Database,
  id: string,
  startedAt: string,
  status: 'success' | 'partial' | 'error',
  totals: {
    items_processed: number;
    entities_inserted: number;
    edges_inserted: number;
  }
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
    ]
  );
}

function recordFailedItem(
  db: Database,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string
): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [scope, itemKey, failedAt, reason, detail]
  );
}

/**
 * Incremental pipeline that reads `trail.current_code_graphs` and runs the
 * full code analysis pipeline (fromTrailGraph, ingestAstFacts,
 * extractDecisionComments, extractCommitRationale) when the graph has been
 * updated since the last run.
 *
 * The trail DB must already be ATTACHed as "trail" on `db`.
 */
export async function runCodeIncremental(opts: {
  db: Database;
  repoName: string;
  tsconfigPath: string;
  gitRoot: string;
  logger?: MemoryLogger;
}): Promise<CodeIncrementalResult> {
  const { db, repoName, tsconfigPath, gitRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── 1. Read last_processed_at ────────────────────────────────────────────
  const { last_processed_at } = readPipelineState(db);

  // ── 2. Read current_code_graphs.updated_at ───────────────────────────────
  let graphUpdatedAt: string | null = null;
  const stmt = db.prepare(
    `SELECT updated_at FROM trail.current_code_graphs WHERE repo_name = ?`
  );
  stmt.bind([repoName]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    graphUpdatedAt = (row['updated_at'] as string) ?? null;
  }
  stmt.free();

  if (graphUpdatedAt === null) {
    logger.info(
      `[memory-core] runCodeIncremental: no code graph found for repo "${repoName}" — skipping`
    );
    return { status: 'skipped', items_processed: 0, entities_inserted: 0, edges_inserted: 0, duration_ms: 0 };
  }

  if (graphUpdatedAt <= last_processed_at) {
    logger.info(
      `[memory-core] runCodeIncremental: graph not updated (updated_at=${graphUpdatedAt}, last_processed_at=${last_processed_at}) — skipping`
    );
    return { status: 'skipped', items_processed: 0, entities_inserted: 0, edges_inserted: 0, duration_ms: 0 };
  }

  // ── 3. Insert pipeline_run (running) ─────────────────────────────────────
  const rId = runId(startedAt);
  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

  const totals = { items_processed: 0, entities_inserted: 0, edges_inserted: 0 };
  let hasIngestFailure = false;

  // ── 4. git rev-parse HEAD ────────────────────────────────────────────────
  let commitSha: string | null = null;
  try {
    commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: gitRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    logger.error(`[memory-core] runCodeIncremental: failed to resolve HEAD commit`, err);
  }

  const recordedAt = new Date().toISOString();

  // ── 5. analyzeWithProgram ────────────────────────────────────────────────
  let analyzeResult: Awaited<ReturnType<typeof analyzeWithProgram>>;
  try {
    analyzeResult = analyzeWithProgram({
      tsconfigPath,
      onProgress: (phase) => logger.info(`[memory] code: ${phase}`),
    });
  } catch (err) {
    logger.error(
      `[memory-core] runCodeIncremental: analyzeWithProgram failed (tsconfigPath=${tsconfigPath})`,
      err
    );
    recordFailedItem(db, 'code', tsconfigPath, 'analyze_failed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    upsertPipelineState(db, {
      status: 'error',
      error_detail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    finalizePipelineRun(db, rId, startedAt, 'error', totals);
    return {
      status: 'error',
      ...totals,
      duration_ms: Date.now() - startMs,
    };
  }

  const { graph } = analyzeResult;
  // Cast is safe: ts.Program API is structurally compatible between trail-core's
  // bundled TypeScript (5.8.x) and the workspace TypeScript (5.9.x). Nominal
  // SyntaxKind enum values differ between the two separate TypeScript copies
  // resolved by the module system, but the runtime objects are identical.
  const program = analyzeResult.program as unknown as ts.Program;

  // ── 6. ingestFromTrailGraph ──────────────────────────────────────────────
  try {
    const stats = fromTrailGraph({ db, repoName, recordedAt, logger });
    totals.items_processed += stats.packages_upserted + stats.files_upserted;
    totals.entities_inserted += stats.packages_upserted + stats.files_upserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runCodeIncremental: fromTrailGraph failed`, err);
    hasIngestFailure = true;
  }

  // ── 7. ingestAstFacts ────────────────────────────────────────────────────
  try {
    const stats = ingestAstFacts({ db, repoName, graph, commitSha, recordedAt, logger });
    totals.items_processed += stats.facts_inserted;
    totals.entities_inserted += stats.facts_inserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runCodeIncremental: ingestAstFacts failed`, err);
    hasIngestFailure = true;
  }

  // ── 8. extractDecisionComments ───────────────────────────────────────────
  try {
    const stats = extractDecisionComments({ db, program, repoName, commitSha, recordedAt, gitRoot, logger });
    totals.entities_inserted += stats.decisions_inserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runCodeIncremental: extractDecisionComments failed`, err);
    hasIngestFailure = true;
  }

  // ── 9. extractCommitRationale ────────────────────────────────────────────
  try {
    const stats = extractCommitRationale({
      db,
      repoName,
      sinceCommittedAt: last_processed_at === DEFAULT_SINCE ? null : last_processed_at,
      recordedAt,
      logger,
    });
    totals.entities_inserted += stats.decisions_inserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[memory-core] runCodeIncremental: extractCommitRationale failed`, err);
    hasIngestFailure = true;
  }

  const finalStatus = hasIngestFailure ? 'partial' : 'success';

  // ── 10. UPDATE pipeline_state ────────────────────────────────────────────
  upsertPipelineState(db, { status: 'idle', last_processed_at: graphUpdatedAt });

  // ── 11. finalize pipeline_run ────────────────────────────────────────────
  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return {
    status: finalStatus,
    ...totals,
    duration_ms: Date.now() - startMs,
  };
}
