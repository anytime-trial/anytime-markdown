import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type CausedByRef = {
  entity_id: string;
  display_name: string;
  confidence_label: string;
};

export type BugHistoryEntry = {
  bug_fix_id: string;
  commit_sha: string;
  package: string;
  category: string;
  subject: string;
  committed_at: string;
  affected_file_paths: string[];
  introduced_commit_sha: string | null;
  caused_by: CausedByRef[];
};

export function getBugHistory(input: {
  db: Database;
  package?: string;
  file_path?: string;
  category?: string;
  limit?: number;
  logger: MemoryLogger;
}): BugHistoryEntry[] {
  const { db, limit = 20, logger } = input;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (input.file_path != null) {
    // Use json_each join for file_path filter
    let rows: ReturnType<Database['exec']>;
    try {
      const fileConds: string[] = [];
      const fileParams: (string | number)[] = [input.file_path];
      if (input.package != null) { fileConds.push('bf.package = ?'); fileParams.push(input.package); }
      if (input.category != null) { fileConds.push('bf.category = ?'); fileParams.push(input.category); }
      fileParams.push(limit);
      const wherePart = fileConds.length > 0 ? 'AND ' + fileConds.join(' AND ') : '';
      rows = db.exec(
        `SELECT DISTINCT bf.id, bf.commit_sha, bf.package, bf.category,
                bf.subject_summary, bf.committed_at,
                bf.affected_file_paths_json, bf.introduced_commit_sha, bf.bug_entity_id
         FROM memory_bug_fixes bf, json_each(bf.affected_file_paths_json)
         WHERE json_each.value = ? ${wherePart}
         ORDER BY bf.committed_at DESC
         LIMIT ?`,
        fileParams,
      );
    } catch (err) {
      logger.error(`[getBugHistory] file_path query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    }
    return buildEntries(db, rows, logger);
  }

  if (input.package != null) { conditions.push('bf.package = ?'); params.push(input.package); }
  if (input.category != null) { conditions.push('bf.category = ?'); params.push(input.category); }
  params.push(limit);

  const wherePart = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT bf.id, bf.commit_sha, bf.package, bf.category,
              bf.subject_summary, bf.committed_at,
              bf.affected_file_paths_json, bf.introduced_commit_sha, bf.bug_entity_id
       FROM memory_bug_fixes bf
       ${wherePart}
       ORDER BY bf.committed_at DESC
       LIMIT ?`,
      params,
    );
  } catch (err) {
    logger.error(`[getBugHistory] query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
    return [];
  }

  return buildEntries(db, rows, logger);
}

function buildEntries(
  db: Database,
  rows: ReturnType<Database['exec']>,
  logger: MemoryLogger,
): BugHistoryEntry[] {
  const entries: BugHistoryEntry[] = [];
  for (const row of rows[0]?.values ?? []) {
    const bugFixId = row[0] as string;
    const commitSha = row[1] as string;
    const pkg = row[2] as string;
    const category = row[3] as string;
    const subject = row[4] as string;
    const committedAt = row[5] as string;
    const pathsJson = row[6] as string;
    const introducedSha = row[7] as string | null;
    const bugEntityId = row[8] as string;

    let affectedPaths: string[] = [];
    try {
      affectedPaths = JSON.parse(pathsJson);
    } catch {
      affectedPaths = [];
    }

    const causedBy = fetchCausedBy(db, bugEntityId, logger);

    entries.push({
      bug_fix_id: bugFixId,
      commit_sha: commitSha,
      package: pkg,
      category,
      subject,
      committed_at: committedAt,
      affected_file_paths: affectedPaths,
      introduced_commit_sha: introducedSha,
      caused_by: causedBy,
    });
  }
  return entries;
}

function fetchCausedBy(db: Database, bugEntityId: string, logger: MemoryLogger): CausedByRef[] {
  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT me.object_entity_id, ent.display_name, me.confidence_label
       FROM memory_edges me
       JOIN memory_entities ent ON ent.id = me.object_entity_id
       WHERE me.subject_entity_id = ?
         AND me.predicate = 'caused_by'
         AND me.valid_to IS NULL
         AND me.confidence_label != 'AMBIGUOUS'`,
      [bugEntityId],
    );
  } catch (err) {
    logger.error(`[getBugHistory] caused_by fetch failed entity=${bugEntityId}: ${String(err)}`);
    return [];
  }
  return (rows[0]?.values ?? []).map((row) => ({
    entity_id: row[0] as string,
    display_name: row[1] as string,
    confidence_label: row[2] as string,
  }));
}
