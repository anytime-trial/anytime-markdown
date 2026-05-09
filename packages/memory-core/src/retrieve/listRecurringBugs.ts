import type { Database } from 'sql.js';
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

export function listRecurringBugs(input: {
  db: Database;
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
    let rows: ReturnType<Database['exec']>;
    try {
      rows = db.exec(
        `SELECT id, commit_sha, subject_summary, committed_at
         FROM memory_bug_fixes
         WHERE package = ?
           AND committed_at >= datetime('now', '-' || ? || ' days')
         ORDER BY committed_at DESC`,
        [input.package, windowDays],
      );
    } catch (err) {
      logger.error(`[listRecurringBugs] package query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return results;
    }
    const bugs: BugFixSummary[] = (rows[0]?.values ?? []).map((row) => ({
      bug_fix_id: row[0] as string,
      commit_sha: row[1] as string,
      subject: row[2] as string,
      committed_at: row[3] as string,
    }));
    if (bugs.length >= minCount) {
      results.push({ grouping: 'package', grouping_value: input.package, bug_count: bugs.length, bugs });
    }
    return results;
  }

  if (input.file_path != null) {
    let rows: ReturnType<Database['exec']>;
    try {
      rows = db.exec(
        `SELECT memory_bug_fixes.id, commit_sha, subject_summary, committed_at
         FROM memory_bug_fixes, json_each(affected_file_paths_json)
         WHERE json_each.value = ?
           AND committed_at >= datetime('now', '-' || ? || ' days')
         ORDER BY committed_at DESC`,
        [input.file_path, windowDays],
      );
    } catch (err) {
      logger.error(`[listRecurringBugs] file_path query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return results;
    }
    const bugs: BugFixSummary[] = (rows[0]?.values ?? []).map((row) => ({
      bug_fix_id: row[0] as string,
      commit_sha: row[1] as string,
      subject: row[2] as string,
      committed_at: row[3] as string,
    }));
    if (bugs.length >= minCount) {
      results.push({ grouping: 'file_path', grouping_value: input.file_path, bug_count: bugs.length, bugs });
    }
    return results;
  }

  if (input.caused_by_entity_id != null) {
    let bugEntityRows: ReturnType<Database['exec']>;
    try {
      bugEntityRows = db.exec(
        `SELECT DISTINCT subject_entity_id
         FROM memory_edges
         WHERE predicate = 'caused_by'
           AND object_entity_id = ?
           AND valid_to IS NULL
           AND confidence_label != 'AMBIGUOUS'`,
        [input.caused_by_entity_id],
      );
    } catch (err) {
      logger.error(`[listRecurringBugs] caused_by query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return results;
    }
    const bugEntityIds = (bugEntityRows[0]?.values ?? []).map((r) => r[0] as string);
    if (bugEntityIds.length < minCount) return results;

    const bugs: BugFixSummary[] = [];
    for (const bugEntityId of bugEntityIds) {
      let fixRows: ReturnType<Database['exec']>;
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
        const row = fixRows[0].values[0];
        bugs.push({ bug_fix_id: row[0] as string, commit_sha: row[1] as string, subject: row[2] as string, committed_at: row[3] as string });
      }
    }
    if (bugs.length >= minCount) {
      results.push({ grouping: 'caused_by', grouping_value: input.caused_by_entity_id, bug_count: bugs.length, bugs });
    }
  }

  return results;
}
