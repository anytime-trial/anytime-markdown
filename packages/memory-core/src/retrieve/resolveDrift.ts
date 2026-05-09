import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type ResolveDriftResult = {
  resolved: boolean;
};

export function resolveDrift(input: {
  db: Database;
  event_id: string;
  resolution_note: string;
  resolved_at?: string;
  logger: MemoryLogger;
}): ResolveDriftResult {
  const { db, event_id, resolution_note, logger } = input;
  const resolved_at = input.resolved_at ?? new Date().toISOString();

  try {
    db.run(
      `UPDATE memory_drift_events
       SET resolved_at = ?, resolution_note = ?
       WHERE id = ? AND resolved_at IS NULL`,
      [resolved_at, resolution_note, event_id],
    );
  } catch (err) {
    logger.error(
      `[resolveDrift] update failed event_id=${event_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return { resolved: false };
  }

  let changesRows: ReturnType<Database['exec']>;
  try {
    changesRows = db.exec('SELECT changes()');
  } catch (err) {
    logger.error(`[resolveDrift] changes() failed: ${String(err)}`);
    return { resolved: false };
  }

  const changed = (changesRows[0]?.values?.[0]?.[0] as number) ?? 0;
  return { resolved: changed > 0 };
}
