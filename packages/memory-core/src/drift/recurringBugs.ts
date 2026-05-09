import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import type { DriftEventInput } from './report';
import { THRESHOLDS } from './policy';

export function detectRegressionClusters(input: {
  db: Database;
  windowDays?: number;
  minCount?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const {
    db,
    windowDays = THRESHOLDS.regressionWindowDays,
    minCount = THRESHOLDS.regressionMinCount,
    logger,
  } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT json_each.value AS file_path, COUNT(*) AS cnt,
              GROUP_CONCAT(memory_bug_fixes.id) AS bug_fix_ids
       FROM memory_bug_fixes, json_each(affected_file_paths_json)
       WHERE category = 'regression'
         AND committed_at >= datetime('now', '-' || ? || ' days')
       GROUP BY json_each.value
       HAVING cnt >= ?`,
      [windowDays, minCount],
    );
  } catch (err) {
    logger.error(
      `[detectRegressionClusters] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const filePath = row[0] as string;
    const cnt = row[1] as number;
    const bugFixIds = (row[2] as string).split(',');

    results.push({
      subject_entity_id: `file:${filePath}`,
      predicate: 'affects',
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'regression_cluster',
      severity: 'error',
      detail: { file_path: filePath, bug_fix_ids: bugFixIds, cnt, windowDays },
    });
  }
  return results;
}

export function detectSpecViolationClusters(input: {
  db: Database;
  windowDays?: number;
  minCount?: number;
  minRatio?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const {
    db,
    windowDays = THRESHOLDS.specViolationWindowDays,
    minCount = THRESHOLDS.specViolationMinCount,
    minRatio = THRESHOLDS.specViolationMinRatio,
    logger,
  } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `WITH pkg_total AS (
         SELECT package, COUNT(*) AS total
         FROM memory_bug_fixes
         WHERE committed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY package
       ),
       pkg_spec AS (
         SELECT package, COUNT(*) AS spec_cnt
         FROM memory_bug_fixes
         WHERE category = 'spec'
           AND committed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY package
       )
       SELECT s.package, s.spec_cnt, t.total,
              CAST(s.spec_cnt AS REAL) / t.total AS ratio
       FROM pkg_spec s JOIN pkg_total t ON s.package = t.package
       WHERE s.spec_cnt >= ? AND CAST(s.spec_cnt AS REAL) / t.total >= ?`,
      [windowDays, windowDays, minCount, minRatio],
    );
  } catch (err) {
    logger.error(
      `[detectSpecViolationClusters] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const pkg = row[0] as string;
    const specCnt = row[1] as number;
    const total = row[2] as number;
    const ratio = row[3] as number;

    results.push({
      subject_entity_id: `package:${pkg}`,
      predicate: 'spec_violation',
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'spec_violation_cluster',
      severity: 'warn',
      detail: { package: pkg, spec_cnt: specCnt, total, ratio, windowDays },
    });
  }
  return results;
}

export function detectRecurringRootCauses(input: {
  db: Database;
  minBugs?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const { db, minBugs = THRESHOLDS.recurringRootCauseMinBugs, logger } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT object_entity_id AS root_cause,
              COUNT(DISTINCT subject_entity_id) AS bug_cnt,
              GROUP_CONCAT(subject_entity_id) AS bugs
       FROM memory_edges
       WHERE predicate = 'caused_by'
         AND valid_to IS NULL
         AND confidence_label != 'AMBIGUOUS'
       GROUP BY object_entity_id
       HAVING bug_cnt >= ?`,
      [minBugs],
    );
  } catch (err) {
    logger.error(
      `[detectRecurringRootCauses] SQL failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const results: DriftEventInput[] = [];
  for (const row of rows[0]?.values ?? []) {
    const rootCause = row[0] as string;
    const bugCnt = row[1] as number;
    const bugs = (row[2] as string).split(',');

    results.push({
      subject_entity_id: rootCause,
      predicate: 'caused_by',
      conversation_value: null,
      spec_value: null,
      code_value: null,
      drift_type: 'recurring_root_cause',
      severity: 'warn',
      detail: { root_cause_entity_id: rootCause, bug_cnt: bugCnt, bug_entity_ids: bugs },
    });
  }
  return results;
}
