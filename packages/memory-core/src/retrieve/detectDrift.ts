import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type DriftEventSummary = {
  event_id: string;
  subject_entity_id: string;
  predicate: string;
  drift_type: string;
  severity: string;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string;
  detail: Record<string, unknown>;
};

export type DetectDriftInput = {
  db: Database;
  unresolved_only?: boolean;
  severity?: string;
  drift_type?: string;
  subject_id?: string;
  since?: string;
  limit?: number;
  logger: MemoryLogger;
};

export function detectDrift(input: DetectDriftInput): DriftEventSummary[] {
  const { db, unresolved_only = true, limit = 50, logger } = input;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (unresolved_only) {
    conditions.push('resolved_at IS NULL');
  }
  if (input.severity != null) {
    conditions.push('severity = ?');
    params.push(input.severity);
  }
  if (input.drift_type != null) {
    conditions.push('drift_type = ?');
    params.push(input.drift_type);
  }
  if (input.subject_id != null) {
    conditions.push('subject_entity_id = ?');
    params.push(input.subject_id);
  }
  if (input.since != null) {
    conditions.push('detected_at >= ?');
    params.push(input.since);
  }
  params.push(limit);

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT id, subject_entity_id, predicate, drift_type, severity,
              detected_at, resolved_at, resolution_note, detail_json
       FROM memory_drift_events
       ${where}
       ORDER BY detected_at DESC
       LIMIT ?`,
      params,
    );
  } catch (err) {
    logger.error(
      `[detectDrift] query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  return (rows[0]?.values ?? []).map((row) => {
    let detail: Record<string, unknown> = {};
    try {
      detail = JSON.parse(row[8] as string);
    } catch {
      detail = {};
    }
    return {
      event_id: row[0] as string,
      subject_entity_id: row[1] as string,
      predicate: row[2] as string,
      drift_type: row[3] as string,
      severity: row[4] as string,
      detected_at: row[5] as string,
      resolved_at: row[6] as string | null,
      resolution_note: row[7] as string,
      detail,
    };
  });
}
