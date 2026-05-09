import type { Database } from 'sql.js';
import type { MemoryLogger } from '../../logger';

export interface AgentRunWatchdogResult {
  stale_count: number;
}

export function runAgentRunWatchdog(input: {
  db: Database;
  timeoutMinutes?: number;
  logger: MemoryLogger;
}): AgentRunWatchdogResult {
  const { db, logger } = input;
  const timeoutMinutes = input.timeoutMinutes ?? 10;
  const now = new Date().toISOString();

  const rows = db.exec(
    `SELECT id FROM memory_review_runs
     WHERE status = 'running'
       AND julianday(started_at) < julianday(?) - CAST(? AS REAL) / 1440.0`,
    [now, timeoutMinutes],
  );

  const ids = (rows[0]?.values ?? []).map((r) => r[0] as string);

  for (const id of ids) {
    db.run(
      `UPDATE memory_review_runs
       SET status       = 'error',
           finished_at  = ?,
           error_detail = 'timeout',
           duration_ms  = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
       WHERE id = ?`,
      [now, now, id],
    );
  }

  if (ids.length > 0) {
    logger.warn?.(
      `[memory-core] agent watchdog: ${ids.length} stale run(s) timed out (>${timeoutMinutes} min)`,
    );
  }

  return { stale_count: ids.length };
}
