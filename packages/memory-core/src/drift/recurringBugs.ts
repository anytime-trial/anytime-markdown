import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';
import type { DriftEventInput } from './report';
import { THRESHOLDS } from './policy';

/**
 * `trail` スキーマが ATTACH されているか。
 *
 * 会話由来の `caused_by` エッジ（実測 83,009 件すべて）は memory-core 側だけでは
 * ワークスペースを決められず、episode → セッション → リポジトリの解決に trail.db が要る。
 * ATTACH されていない文脈（ユニットテスト・memory-core 単独利用）で trail. を参照すると
 * クエリ全体が落ちて検出結果が 0 件になるため、参照する前にここで判定する。
 */
function hasTrailAttached(db: MemoryDbConnection, logger: MemoryLogger): boolean {
  try {
    const rows = db.exec('PRAGMA database_list')[0]?.values ?? [];
    return rows.some((row) => String(row[1]) === 'trail');
  } catch (err) {
    logger.error(`[recurringBugs] PRAGMA database_list failed: ${String(err)}`);
    return false;
  }
}

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
      // memory_drift_events が UNIQUE(subject_entity_id, predicate, drift_type) を持ち、
      // 同じファイルパスが 2 ワークスペースに在ると 2 候補が同じキーで衝突するため。
      `SELECT json_each.value AS file_path, COUNT(*) AS cnt,
              GROUP_CONCAT(memory_bug_fixes.id) AS bug_fix_ids,
              CASE WHEN COUNT(DISTINCT memory_bug_fixes.workspace) = 1
                   THEN MIN(memory_bug_fixes.workspace) ELSE '' END AS workspace
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
         FROM memory_bug_fixes
         WHERE committed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY package
       ),
       pkg_spec AS (
         SELECT package, COUNT(*) AS spec_cnt,
                CASE WHEN COUNT(DISTINCT workspace) = 1
                     THEN MIN(workspace) ELSE '' END AS workspace
         FROM memory_bug_fixes
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

export function detectRecurringRootCauses(input: {
  db: MemoryDbConnection;
  minBugs?: number;
  logger: MemoryLogger;
}): DriftEventInput[] {
  const { db, minBugs = THRESHOLDS.recurringRootCauseMinBugs, logger } = input;

  // workspace の出所は 2 つ。バグ修正コミット由来なら memory_bug_fixes.workspace、
  // 会話由来なら episode → セッション → リポジトリ（trail.db）。実データでは後者が
  // ほぼ全件を占めるため、trail.db が ATTACH されていない文脈では大半が未解決になる。
  // 複数ワークスペースに跨る根本原因は '' （未解決）にする — 片方へ寄せると、
  // もう片方のワークスペースで絞ったときにこの乖離が消える。
  const bugWorkspace = "NULLIF(bf.workspace, '')";
  const workspaceExpr = hasTrailAttached(db, logger)
    ? `COALESCE(r.repo_name, ${bugWorkspace})`
    : bugWorkspace;
  const trailJoins = hasTrailAttached(db, logger)
    ? `LEFT JOIN memory_episodes ep ON ep.id = e.source_ref
       LEFT JOIN trail.sessions s ON s.id = ep.session_id
       LEFT JOIN trail.repos r ON r.repo_id = s.repo_id`
    : '';
  const sql = `SELECT e.object_entity_id AS root_cause,
              COUNT(DISTINCT e.subject_entity_id) AS bug_cnt,
              GROUP_CONCAT(DISTINCT e.subject_entity_id) AS bugs,
              CASE WHEN COUNT(DISTINCT ${workspaceExpr}) = 1
                   THEN MIN(${workspaceExpr}) ELSE '' END AS workspace
       FROM memory_edges e
       LEFT JOIN memory_bug_fixes bf ON bf.bug_entity_id = e.subject_entity_id
       ${trailJoins}
       WHERE e.predicate = 'caused_by'
         AND e.valid_to IS NULL
         AND e.confidence_label != 'AMBIGUOUS'
       GROUP BY e.object_entity_id
       HAVING bug_cnt >= ?`;

  let rows: ReturnType<MemoryDbConnection['exec']>;
  try {
    rows = db.exec(
      sql,
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
      workspace: (row[3] as string | null) ?? '',
      detail: { root_cause_entity_id: rootCause, bug_cnt: bugCnt, bug_entity_ids: bugs },
    });
  }
  return results;
}
