import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';

export type BugFixSummary = {
  bug_fix_id: string;
  commit_sha: string;
  subject: string;
  committed_at: string;
};

export type RecurringBugGroup = {
  grouping: 'file_path' | 'package' | 'caused_by';
  grouping_value: string;
  bug_count: number;
  bugs: BugFixSummary[];
};

function toBugFixSummary(row: readonly unknown[]): BugFixSummary {
  return {
    bug_fix_id: row[0] as string,
    commit_sha: row[1] as string,
    subject: row[2] as string,
    committed_at: row[3] as string,
  };
}

function queryPackageBugs(
  db: MemoryDbConnection,
  pkg: string,
  windowDays: number,
  minCount: number,
  logger: MemoryLogger,
): RecurringBugGroup | null {
  let rows: ReturnType<MemoryDbConnection['exec']>;
  try {
    rows = db.exec(
      `SELECT id, commit_sha, subject_summary, committed_at
       FROM memory_bug_fixes
       WHERE package = ?
         AND committed_at >= datetime('now', '-' || ? || ' days')
       ORDER BY committed_at DESC`,
      [pkg, windowDays],
    );
  } catch (err) {
    logger.error(`[listRecurringBugs] package query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    return null;
  }
  const bugs = (rows[0]?.values ?? []).map(toBugFixSummary);
  return bugs.length >= minCount ? { grouping: 'package', grouping_value: pkg, bug_count: bugs.length, bugs } : null;
}

function queryFilePathBugs(
  db: MemoryDbConnection,
  filePath: string,
  windowDays: number,
  minCount: number,
  logger: MemoryLogger,
): RecurringBugGroup | null {
  let rows: ReturnType<MemoryDbConnection['exec']>;
  try {
    rows = db.exec(
      `SELECT memory_bug_fixes.id, commit_sha, subject_summary, committed_at
       FROM memory_bug_fixes, json_each(affected_file_paths_json)
       WHERE json_each.value = ?
         AND committed_at >= datetime('now', '-' || ? || ' days')
       ORDER BY committed_at DESC`,
      [filePath, windowDays],
    );
  } catch (err) {
    logger.error(`[listRecurringBugs] file_path query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    return null;
  }
  const bugs = (rows[0]?.values ?? []).map(toBugFixSummary);
  return bugs.length >= minCount ? { grouping: 'file_path', grouping_value: filePath, bug_count: bugs.length, bugs } : null;
}

function queryCausedByBugs(
  db: MemoryDbConnection,
  causedByEntityId: string,
  windowDays: number,
  minCount: number,
  logger: MemoryLogger,
): RecurringBugGroup | null {
  let bugEntityRows: ReturnType<MemoryDbConnection['exec']>;
  try {
    bugEntityRows = db.exec(
      `SELECT DISTINCT subject_entity_id
       FROM memory_edges
       WHERE predicate = 'caused_by'
         AND object_entity_id = ?
         AND valid_to IS NULL
         AND confidence_label != 'AMBIGUOUS'`,
      [causedByEntityId],
    );
  } catch (err) {
    logger.error(`[listRecurringBugs] caused_by query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    return null;
  }

  const bugEntityIds = (bugEntityRows[0]?.values ?? []).map((r) => r[0] as string);
  if (bugEntityIds.length < minCount) return null;

  const bugs: BugFixSummary[] = [];
  for (const bugEntityId of bugEntityIds) {
    let fixRows: ReturnType<MemoryDbConnection['exec']>;
    try {
      fixRows = db.exec(
        `SELECT id, commit_sha, subject_summary, committed_at
         FROM memory_bug_fixes
         WHERE bug_entity_id = ?
           AND committed_at >= datetime('now', '-' || ? || ' days')
         ORDER BY committed_at DESC LIMIT 1`,
        [bugEntityId, windowDays],
      );
    } catch (err) {
      logger.error(`[listRecurringBugs] bug fix lookup failed entity=${bugEntityId}: ${String(err)}`);
      continue;
    }
    if (fixRows[0]?.values?.length) {
      bugs.push(toBugFixSummary(fixRows[0].values[0]));
    }
  }
  return bugs.length >= minCount
    ? { grouping: 'caused_by', grouping_value: causedByEntityId, bug_count: bugs.length, bugs }
    : null;
}

export function listRecurringBugs(input: {
  db: MemoryDbConnection;
  package?: string;
  file_path?: string;
  caused_by_entity_id?: string;
  windowDays?: number;
  minCount?: number;
  logger: MemoryLogger;
}): RecurringBugGroup[] {
  const { db, windowDays = 90, minCount = 2, logger } = input;
  const results: RecurringBugGroup[] = [];

  if (input.package != null) {
    const group = queryPackageBugs(db, input.package, windowDays, minCount, logger);
    if (group) results.push(group);
    return results;
  }

  if (input.file_path != null) {
    const group = queryFilePathBugs(db, input.file_path, windowDays, minCount, logger);
    if (group) results.push(group);
    return results;
  }

  if (input.caused_by_entity_id != null) {
    const group = queryCausedByBugs(db, input.caused_by_entity_id, windowDays, minCount, logger);
    if (group) results.push(group);
  }

  return results;
}
