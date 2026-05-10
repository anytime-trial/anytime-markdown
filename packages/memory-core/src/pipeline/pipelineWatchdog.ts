import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export interface PipelineWatchdogResult {
  stale_runs: number;
  stale_states: number;
}

/**
 * Cleans up stale entries in memory_pipeline_runs / memory_pipeline_state that
 * a previous pipeline left behind after a crash, VS Code reload, or OS shutdown.
 *
 * - memory_pipeline_runs rows with status='running' older than `timeoutMinutes`
 *   are flipped to status='error' (error_detail='timeout').
 * - memory_pipeline_state rows with status='running' that no longer have a
 *   matching running run are flipped to status='idle' (last_processed_at is
 *   preserved so the next run can resume from where it left off).
 */
export function runPipelineWatchdog(input: {
  db: Database;
  timeoutMinutes?: number;
  logger: MemoryLogger;
}): PipelineWatchdogResult {
  const { db, logger } = input;
  const timeoutMinutes = input.timeoutMinutes ?? 10;
  const now = new Date().toISOString();

  // 1. Timeout stale running pipeline_runs.
  const staleRunRows = db.exec(
    `SELECT id FROM memory_pipeline_runs
     WHERE status = 'running'
       AND julianday(started_at) < julianday(?) - CAST(? AS REAL) / 1440.0`,
    [now, timeoutMinutes],
  );
  const runIds = (staleRunRows[0]?.values ?? []).map((r) => r[0] as string);
  for (const id of runIds) {
    db.run(
      `UPDATE memory_pipeline_runs
       SET status       = 'error',
           finished_at  = ?,
           error_detail = 'timeout',
           duration_ms  = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
       WHERE id = ?`,
      [now, now, id],
    );
  }

  // 2. Reset orphan running states (no matching running run remains).
  const orphanStateRows = db.exec(
    `SELECT s.scope FROM memory_pipeline_state s
     WHERE s.status = 'running'
       AND NOT EXISTS (
         SELECT 1 FROM memory_pipeline_runs r
         WHERE r.scope = s.scope AND r.status = 'running'
       )`,
  );
  const orphanScopes = (orphanStateRows[0]?.values ?? []).map((r) => r[0] as string);
  for (const scope of orphanScopes) {
    db.run(
      `UPDATE memory_pipeline_state SET status = 'idle' WHERE scope = ?`,
      [scope],
    );
  }

  if (runIds.length > 0 || orphanScopes.length > 0) {
    logger.info(
      `[memory-core] pipeline watchdog: ${runIds.length} stale run(s), ${orphanScopes.length} orphan state(s)`,
    );
  }

  return { stale_runs: runIds.length, stale_states: orphanScopes.length };
}
