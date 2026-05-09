import { createHash } from 'crypto';
import type { Database } from 'sql.js';
import { parseFixCommit } from '../ingest/bug-history/parseFixCommit';
import { buildBugEntity } from '../ingest/bug-history/buildBugEntity';
import { linkAffectedFiles } from '../ingest/bug-history/linkAffectedFiles';
import { inferIntroducedBy } from '../ingest/bug-history/inferIntroducedBy';
import { linkRootCauseEpisode } from '../ingest/bug-history/linkRootCauseEpisode';
import { upsertBugEntity, upsertCommitEntity, upsertBugFix, insertFixesEdge } from '../ingest/bug-history/persist';
import { entityId } from '../canonical/entityId';
import { noopLogger, type MemoryLogger } from '../logger';

const SCOPE = 'bug_history_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const MAX_CONSECUTIVE_FAILURES = 5;

export interface BugHistoryIncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  bugs_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

function runId(startedAt: string): string {
  return createHash('sha1').update(`${SCOPE}:${startedAt}`).digest('hex').slice(0, 16);
}

function readPipelineState(db: Database): string {
  const stmt = db.prepare(`SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`);
  stmt.bind([SCOPE]);
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
  opts: { status: string; last_processed_at?: string; error_detail?: string }
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
    [SCOPE, opts.status, opts.last_processed_at ?? '', opts.error_detail ?? '']
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
  totals: { items_processed: number; entities_inserted: number; edges_inserted: number }
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
    [finishedAt, status, totals.items_processed, totals.entities_inserted, totals.edges_inserted, durationMs, id]
  );
}

function recordFailedItem(db: Database, itemKey: string, reason: string, detail: string): void {
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [SCOPE, itemKey, new Date().toISOString(), reason, detail]
  );
}

interface CommitRow {
  commit_hash: string;
  commit_message: string;
  committed_at: string;
  repo_name: string;
  session_id: string | null;
}

export async function runBugHistoryIncremental(opts: {
  db: Database;
  repoName: string;
  repoRoot: string;
  logger?: MemoryLogger;
}): Promise<BugHistoryIncrementalResult> {
  const { db, repoName, repoRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── 1. Read last_processed_at ────────────────────────────────────────────
  const lastProcessedAt = readPipelineState(db);

  // ── 2. Query fix commits from trail DB ─────────────────────────────────
  const rows: CommitRow[] = [];
  const stmt = db.prepare(
    `SELECT commit_hash, commit_message, committed_at, repo_name, session_id
     FROM trail.session_commits
     WHERE repo_name = ? AND committed_at > ? AND commit_message LIKE 'fix%'
     ORDER BY committed_at`
  );
  stmt.bind([repoName, lastProcessedAt]);
  while (stmt.step()) {
    const r = stmt.getAsObject();
    rows.push({
      commit_hash: String(r['commit_hash'] ?? ''),
      commit_message: String(r['commit_message'] ?? ''),
      committed_at: String(r['committed_at'] ?? ''),
      repo_name: String(r['repo_name'] ?? repoName),
      session_id: r['session_id'] != null ? String(r['session_id']) : null,
    });
  }
  stmt.free();

  if (rows.length === 0) {
    return { status: 'success', items_processed: 0, bugs_inserted: 0, edges_inserted: 0, duration_ms: 0 };
  }

  // ── 3. Insert pipeline_run (running) ─────────────────────────────────────
  const rId = runId(startedAt);
  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

  const totals = { items_processed: 0, entities_inserted: 0, edges_inserted: 0 };
  let bugsInserted = 0;
  let consecutiveFailures = 0;
  let maxCommittedAt = lastProcessedAt;
  let hasPartialFailure = false;

  // ── 4. Process each commit ────────────────────────────────────────────────
  for (const row of rows) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.info(`[memory-core] runBugHistoryIncremental: quarantine threshold reached`);
      hasPartialFailure = true;
      break;
    }

    const subject = row.commit_message.split('\n')[0] ?? '';
    const parsed = parseFixCommit({ subject });
    if (parsed === null) {
      // Pre-filter (LIKE 'fix%') may include non-fix commits (e.g. 'fixup:')
      continue;
    }

    const recordedAt = new Date().toISOString();
    const commitSha = row.commit_hash;
    const committedAt = row.committed_at;
    const sessionId = row.session_id;
    const bugEntityId = entityId('Bug', commitSha);
    const bugFixId = entityId('BugFix', commitSha);

    try {
      // a. Pre-insert Bug entity with preliminary data so FK constraints pass for affects edges
      const prelimBugEntity = buildBugEntity({
        commitSha, parsed, committedAt,
        affectedFilePaths: [],
        introducedCommitSha: null,
        recordedAt,
      });
      upsertBugEntity(db, prelimBugEntity);

      // b. Upsert Commit entity (needed before fixes edge)
      const commitId = upsertCommitEntity(db, { commitSha, recordedAt });

      // c. Insert fixes edge: Commit → Bug
      const fixesInserted = insertFixesEdge(db, {
        commitId, bugEntityId, commitSha, validFrom: committedAt, recordedAt,
      });

      // d. Link affected files (Bug entity now exists for FK)
      const affectedResult = linkAffectedFiles({
        db, bugEntityId, commitSha, repoName, recordedAt, valid_from: committedAt, logger,
      });
      totals.edges_inserted += affectedResult.edges_inserted;

      // e. Infer introduced_by
      const introResult = inferIntroducedBy({
        db,
        bugEntityId,
        fixCommitSha: commitSha,
        affectedFilePaths: affectedResult.file_paths,
        repoRoot,
        recordedAt,
        valid_from: committedAt,
        logger,
      });
      totals.edges_inserted += introResult.edges_inserted;

      // f. Replace Bug entity with final data (file paths + introduced commit now known)
      const finalBugEntity = buildBugEntity({
        commitSha, parsed, committedAt,
        affectedFilePaths: affectedResult.file_paths,
        introducedCommitSha: introResult.introduced_commit_sha,
        recordedAt,
      });
      upsertBugEntity(db, finalBugEntity);
      totals.entities_inserted += 2; // Bug + Commit
      bugsInserted += 1;
      if (fixesInserted) totals.edges_inserted += 1;

      // g. Upsert memory_bug_fixes
      upsertBugFix(db, {
        id: bugFixId,
        commitSha,
        bugEntityId,
        pkg: parsed.package,
        category: parsed.category,
        subjectSummary: parsed.subject_summary,
        affectedFilePaths: affectedResult.file_paths,
        committedAt,
        recordedAt,
        sessionId,
        introducedCommitSha: introResult.introduced_commit_sha,
      });

      // h. Link root cause episode
      linkRootCauseEpisode({ db, bugFixId, sessionId, committedAt, logger });

      totals.items_processed += 1;
      if (committedAt > maxCommittedAt) maxCommittedAt = committedAt;
      consecutiveFailures = 0;
    } catch (err) {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      logger.error(
        `[memory-core] runBugHistoryIncremental: failed to process commit=${commitSha}`, err
      );
      recordFailedItem(db, commitSha, 'process_failed', detail);
      consecutiveFailures += 1;
      hasPartialFailure = true;
    }
  }

  const finalStatus = hasPartialFailure ? 'partial' : 'success';

  // ── 5. Update pipeline_state ─────────────────────────────────────────────
  upsertPipelineState(db, { status: 'idle', last_processed_at: maxCommittedAt });

  // ── 6. Finalize pipeline_run ─────────────────────────────────────────────
  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return {
    status: finalStatus,
    items_processed: totals.items_processed,
    bugs_inserted: bugsInserted,
    edges_inserted: totals.edges_inserted,
    duration_ms: Date.now() - startMs,
  };
}
