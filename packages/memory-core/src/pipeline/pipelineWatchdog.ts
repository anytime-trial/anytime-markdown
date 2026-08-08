import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';

export interface PipelineWatchdogResult {
  stale_runs: number;
  stale_states: number;
}

/**
 * Cleans up stale entries in pipeline_runs / memory_pipeline_state that
 * a previous pipeline left behind after a crash, VS Code reload, or OS shutdown.
 *
 * - pipeline_runs rows with status='running' older than `timeoutMinutes`
 *   are flipped to status='error' (error_detail='timeout').
 * - wave='system' (daemon_session) rows use the longer `systemTimeoutMinutes`:
 *   the daemon advances last_heartbeat_at periodically, so a stale heartbeat
 *   means the daemon died without shutdown (crash / VS Code reload) and the
 *   row would otherwise stay 'running' forever (2026-08-08 監査: ゴースト 4 件).
 * - memory_pipeline_state rows with status='running' that no longer have a
 *   matching running run are flipped to status='idle' (last_processed_at is
 *   preserved so the next run can resume from where it left off).
 */
export function runPipelineWatchdog(input: {
  db: MemoryDbConnection;
  timeoutMinutes?: number;
  systemTimeoutMinutes?: number;
  logger: MemoryLogger;
}): PipelineWatchdogResult {
  const { db, logger } = input;
  const timeoutMinutes = input.timeoutMinutes ?? 10;
  const systemTimeoutMinutes = input.systemTimeoutMinutes ?? 30;
  const now = new Date().toISOString();

  // 1. Timeout stale running pipeline_runs.
  // Staleness is judged by the most recent progress signal:
  // last_heartbeat_at if the pipeline has reported progress, otherwise started_at.
  // This lets long-running backfills (hours) survive the 10-minute timeout
  // as long as they keep updating last_heartbeat_at.
  //
  // wave='system' (daemon_session) は daemon プロセスの生存期間を表す run。daemon が
  // 定期 heartbeat で last_heartbeat_at を進めるため、通常 run より長い systemTimeoutMinutes
  // で失効判定する（正常稼働中の daemon を偽 timeout にしない）。heartbeat が止まったまま
  // 閾値を超えた system run は、shutdown の finish() を通らずに死んだゴーストなので回収する。
  const staleRunRows = db.exec(
    `SELECT id FROM pipeline_runs
     WHERE status = 'running'
       AND julianday(COALESCE(last_heartbeat_at, started_at))
         < julianday(?) - (CASE WHEN wave = 'system' THEN CAST(? AS REAL) ELSE CAST(? AS REAL) END) / 1440.0`,
    [now, systemTimeoutMinutes, timeoutMinutes],
  );
  const runIds = (staleRunRows[0]?.values ?? []).map((r) => r[0] as string);
  for (const id of runIds) {
    db.run(
      `UPDATE pipeline_runs
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
         SELECT 1 FROM pipeline_runs r
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
      `[anytime-memory] pipeline watchdog: ${runIds.length} stale run(s), ${orphanScopes.length} orphan state(s)`,
    );
  }

  return { stale_runs: runIds.length, stale_states: orphanScopes.length };
}
