import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import type { DriftEventInput } from './report';

export function postProcessF22(input: {
  db: Database;
  driftEvents: DriftEventInput[];
  recordedAt: string;
  logger: MemoryLogger;
}): { findings_suggested: number } {
  const { db, driftEvents, recordedAt, logger } = input;

  const f22Events = driftEvents.filter((e) => e.drift_type === 'spec_clarification_recurring');
  let findingsSuggested = 0;

  for (const event of f22Events) {
    const targetSpecPath = event.detail['target_spec_path'] as string | undefined;
    if (!targetSpecPath) continue;

    // drift event の ID を生成（report.ts と同一ロジック）
    const eventId = `drift:${event.subject_entity_id}:${event.predicate}:${event.drift_type}`;

    let rows: ReturnType<Database['exec']>;
    try {
      rows = db.exec(
        `SELECT e.id, e.attributes_json
         FROM memory_review_findings rf
         JOIN memory_entities e ON e.id = rf.finding_entity_id
         WHERE rf.target_file_path = ?
           AND rf.category = 'other'`,
        [targetSpecPath],
      );
    } catch (err) {
      logger.error(
        `[postProcessF22] query failed for ${targetSpecPath}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
      );
      continue;
    }

    for (const row of rows[0]?.values ?? []) {
      const entityId = row[0] as string;
      const attrsJson = row[1] as string;

      let attrs: Record<string, unknown> = {};
      try {
        attrs = JSON.parse(attrsJson);
      } catch {
        // malformed json — skip
      }

      attrs['category_suggested'] = 'spec';
      attrs['suggested_at'] = recordedAt;
      attrs['suggested_by'] = eventId;

      try {
        db.run(`UPDATE memory_entities SET attributes_json = ? WHERE id = ?`, [
          JSON.stringify(attrs),
          entityId,
        ]);
        findingsSuggested++;
      } catch (err) {
        logger.error(
          `[postProcessF22] update failed entity=${entityId}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
        );
      }
    }
  }

  return { findings_suggested: findingsSuggested };
}
