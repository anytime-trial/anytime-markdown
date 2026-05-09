import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import type { DriftEventInput } from './report';
import { THRESHOLDS, decideSeverity } from './policy';

export function detectReviewUnfixed(input: {
  db: Database;
  daysOld?: number;
  minSeverity?: 'warn' | 'error';
  logger: MemoryLogger;
}): DriftEventInput[] {
  const {
    db,
    daysOld = THRESHOLDS.reviewUnfixedDays,
    minSeverity = THRESHOLDS.reviewUnfixedMinSeverity,
    logger,
  } = input;

  const severities = minSeverity === 'error' ? ['error'] : ['warn', 'error'];
  const placeholders = severities.map(() => '?').join(', ');

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT id, finding_entity_id, target_file_path, severity, recorded_at
       FROM memory_review_findings
       WHERE addressed_at IS NULL
         AND severity IN (${placeholders})
         AND recorded_at <= datetime('now', '-' || ? || ' days')`,
      [...severities, daysOld],
    );
  } catch (err) {
    logger.error(
      `[detectReviewUnfixed] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const findingId = row[0] as string;
    const findingEntityId = row[1] as string;
    const filePath = row[2] as string | null;
    const severity = row[3] as 'warn' | 'error';
    const recordedAt = row[4] as string;

    results.push({
      subject_entity_id: findingEntityId,
      predicate: 'review_finding',
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'review_unfixed',
      severity,
      detail: {
        finding_id: findingId,
        target_file_path: filePath,
        recorded_at: recordedAt,
        days_old: daysOld,
      },
    });
  }
  return results;
}

export function detectReviewVsCode(input: {
  db: Database;
  existingSpecVsCodeKeys?: Set<string>;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const { db, existingSpecVsCodeKeys = new Set(), logger } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT subject_entity_id, predicate,
              MAX(CASE WHEN source_type = 'review' THEN COALESCE(object_literal, object_entity_id) END) AS rev_v,
              MAX(CASE WHEN source_type = 'code'   THEN COALESCE(object_literal, object_entity_id) END) AS code_v
       FROM memory_edges
       WHERE valid_to IS NULL
         AND modality = 'asserted'
         AND confidence >= 0.6
         AND predicate NOT IN ('relates_to')
       GROUP BY subject_entity_id, predicate
       HAVING rev_v IS NOT NULL AND code_v IS NOT NULL AND rev_v != code_v`,
    );
  } catch (err) {
    logger.error(
      `[detectReviewVsCode] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const subjectId = row[0] as string;
    const predicate = row[1] as string;
    const revV = row[2] as string;
    const codeV = row[3] as string;

    const overlapKey = `${subjectId}:${predicate}`;
    const hasSpecVsCode = existingSpecVsCodeKeys.has(overlapKey);
    const severity = decideSeverity('review_vs_code', predicate, 0.7, {
      spec_vs_code: hasSpecVsCode,
    });

    results.push({
      subject_entity_id: subjectId,
      predicate,
      conversation_value: null,
      spec_value: null,
      code_value: codeV,
      drift_type: 'review_vs_code',
      severity,
      detail: { review_value: revV, code_value: codeV, spec_vs_code_overlap: hasSpecVsCode },
    });
  }
  return results;
}

export function detectRecurringReviewFindings(input: {
  db: Database;
  windowDays?: number;
  minCount?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const {
    db,
    windowDays = THRESHOLDS.recurringReviewWindowDays,
    minCount = THRESHOLDS.recurringReviewMinCount,
    logger,
  } = input;

  const excludeCategories = THRESHOLDS.recurringReviewExcludeCategories as readonly string[];
  const placeholders = excludeCategories.map(() => '?').join(', ');

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT target_file_path, category, COUNT(*) AS cnt,
              GROUP_CONCAT(id) AS finding_ids
       FROM memory_review_findings
       WHERE category NOT IN (${placeholders})
         AND target_file_path IS NOT NULL
         AND recorded_at >= datetime('now', '-' || ? || ' days')
       GROUP BY target_file_path, category
       HAVING cnt >= ?`,
      [...excludeCategories, windowDays, minCount],
    );
  } catch (err) {
    logger.error(
      `[detectRecurringReviewFindings] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const filePath = row[0] as string;
    const category = row[1] as string;
    const cnt = row[2] as number;
    const findingIds = (row[3] as string).split(',');

    results.push({
      subject_entity_id: `file:${filePath}`,
      predicate: `review_finding:${category}`,
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'recurring_review_finding',
      severity: 'warn',
      detail: { file_path: filePath, category, cnt, finding_ids: findingIds, windowDays },
    });
  }
  return results;
}
