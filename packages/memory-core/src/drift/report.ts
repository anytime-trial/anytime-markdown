import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import type { DriftType, Severity } from './policy';

export type DriftEventInput = {
  subject_entity_id: string;
  predicate: string;
  conversation_value: string | null;
  spec_value: string | null;
  code_value: string | null;
  drift_type: DriftType;
  severity: Severity;
  detail: Record<string, unknown>;
};

type ReportResult = {
  events_inserted: number;
  events_updated: number;
  events_resolved: number;
};

type ActiveEvent = {
  id: string;
  subject_entity_id: string;
  predicate: string;
  drift_type: string;
};

function driftKey(subjectId: string, predicate: string, driftType: string): string {
  return `${subjectId}:${predicate}:${driftType}`;
}

function eventId(subjectId: string, predicate: string, driftType: string): string {
  return `drift:${subjectId}:${predicate}:${driftType}`;
}

export function reportDriftEvents(input: {
  db: Database;
  candidates: DriftEventInput[];
  recordedAt: string;
  autoResolveStale?: boolean;
  logger: MemoryLogger;
}): ReportResult {
  const { db, candidates, recordedAt, autoResolveStale = true, logger } = input;

  const result: ReportResult = { events_inserted: 0, events_updated: 0, events_resolved: 0 };

  // 1. 既存の active drift events を取得
  const rows = db.exec(
    'SELECT id, subject_entity_id, predicate, drift_type FROM memory_drift_events WHERE resolved_at IS NULL',
  );
  const activeEvents: ActiveEvent[] = (rows[0]?.values ?? []).map((r) => ({
    id: r[0] as string,
    subject_entity_id: r[1] as string,
    predicate: r[2] as string,
    drift_type: r[3] as string,
  }));

  // 2. 候補を Set 化
  const candidateKeys = new Set(
    candidates.map((c) => driftKey(c.subject_entity_id, c.predicate, c.drift_type)),
  );

  // 3. auto-resolve: 候補に含まれなくなった既存 event
  if (autoResolveStale) {
    for (const ev of activeEvents) {
      const key = driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type);
      if (!candidateKeys.has(key)) {
        try {
          db.run(
            `UPDATE memory_drift_events
             SET resolved_at = ?, resolution_note = 'auto: drift no longer present'
             WHERE id = ?`,
            [recordedAt, ev.id],
          );
          result.events_resolved++;
        } catch (err) {
          logger.error(`[reportDriftEvents] auto-resolve failed id=${ev.id}: ${String(err)}`);
        }
      }
    }
  }

  // 4. 候補を upsert（SELECT → UPDATE or INSERT）
  const activeByKey = new Map<string, ActiveEvent>();
  for (const ev of activeEvents) {
    activeByKey.set(driftKey(ev.subject_entity_id, ev.predicate, ev.drift_type), ev);
  }

  for (const candidate of candidates) {
    const key = driftKey(candidate.subject_entity_id, candidate.predicate, candidate.drift_type);
    const existing = activeByKey.get(key);
    const detailJson = JSON.stringify({
      ...candidate.detail,
      policy_version: 'phase4-v1',
    });

    if (existing) {
      // severity と detail_json のみ更新（detected_at は変えない）
      try {
        db.run(
          `UPDATE memory_drift_events SET severity = ?, detail_json = ? WHERE id = ?`,
          [candidate.severity, detailJson, existing.id],
        );
        result.events_updated++;
      } catch (err) {
        logger.error(`[reportDriftEvents] update failed id=${existing.id}: ${String(err)}`);
      }
    } else {
      // 新規 INSERT（resolved の行があっても新規行として追加）
      const id = eventId(candidate.subject_entity_id, candidate.predicate, candidate.drift_type);
      try {
        db.run(
          `INSERT INTO memory_drift_events
             (id, subject_entity_id, predicate, conversation_value, spec_value, code_value,
              drift_type, severity, detected_at, detail_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            candidate.subject_entity_id,
            candidate.predicate,
            candidate.conversation_value ?? null,
            candidate.spec_value ?? null,
            candidate.code_value ?? null,
            candidate.drift_type,
            candidate.severity,
            recordedAt,
            detailJson,
          ],
        );
        result.events_inserted++;
      } catch (err) {
        logger.error(
          `[reportDriftEvents] insert failed ${key}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
        );
      }
    }
  }

  return result;
}
