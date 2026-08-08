import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';
import type { DriftEventInput } from './report';
import { THRESHOLDS } from './policy';

export function detectRegressionClusters(input: {
  db: MemoryDbConnection;
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

  let rows: ReturnType<MemoryDbConnection['exec']>;
  try {
    rows = db.exec(
      // workspace はクラスタを構成するバグが 1 つのワークスペースへ収束するときだけ確定する。
      // 跨っていたら '' （未解決）。ワークスペースを grouping key に足さないのは
      // caravan_drift_events が UNIQUE(subject_entity_id, predicate, drift_type) を持ち、
      // 同じファイルパスが 2 ワークスペースに在ると 2 候補が同じキーで衝突するため。
      // NULLIF で '' を判定から外すのは、'' が「別のワークスペース」ではなく「未解決」だから。
      // 数に入れると、未解決が 1 件混ざっただけでクラスタ全体が未解決へ落ちる。
      `SELECT json_each.value AS file_path, COUNT(*) AS cnt,
              GROUP_CONCAT(caravan_bug_fixes.id) AS bug_fix_ids,
              CASE WHEN COUNT(DISTINCT NULLIF(caravan_bug_fixes.workspace, '')) = 1
                   THEN MIN(NULLIF(caravan_bug_fixes.workspace, '')) ELSE '' END AS workspace
       FROM caravan_bug_fixes, json_each(affected_file_paths_json)
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
      workspace: (row[3] as string | null) ?? '',
      detail: { file_path: filePath, bug_fix_ids: bugFixIds, cnt, windowDays },
    });
  }
  return results;
}

export function detectSpecViolationClusters(input: {
  db: MemoryDbConnection;
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

  let rows: ReturnType<MemoryDbConnection['exec']>;
  try {
    rows = db.exec(
      `WITH pkg_total AS (
         SELECT package, COUNT(*) AS total
         FROM caravan_bug_fixes
         WHERE committed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY package
       ),
       pkg_spec AS (
         SELECT package, COUNT(*) AS spec_cnt,
                CASE WHEN COUNT(DISTINCT NULLIF(workspace, '')) = 1
                     THEN MIN(NULLIF(workspace, '')) ELSE '' END AS workspace
         FROM caravan_bug_fixes
         WHERE category = 'spec'
           AND committed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY package
       )
       SELECT s.package, s.spec_cnt, t.total,
              CAST(s.spec_cnt AS REAL) / t.total AS ratio, s.workspace
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
      workspace: (row[4] as string | null) ?? '',
      detail: { package: pkg, spec_cnt: specCnt, total, ratio, windowDays },
    });
  }
  return results;
}

