import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';

export type ReviewTargetHint = {
  target_ref: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
};

export function listReviewTargetHints(input: {
  db: MemoryDbConnection;
  limit?: number;
  logger: MemoryLogger;
}): ReviewTargetHint[] {
  const { db, limit = 20, logger } = input;
  const results: ReviewTargetHint[] = [];
  const seen = new Set<string>();

  function add(ref: string, priority: ReviewTargetHint['priority'], reason: string) {
    if (!seen.has(ref)) {
      seen.add(ref);
      results.push({ target_ref: ref, priority, reason });
    }
  }

  function addScalarRows(
    sql: string,
    priority: ReviewTargetHint['priority'],
    reason: string,
    onError: string,
  ): void {
    try {
      const rows = db.exec(sql);
      for (const row of rows[0]?.values ?? []) {
        const ref = row[0] as string;
        if (ref) add(ref, priority, reason);
      }
    } catch (err) {
      logger.error(`[listReviewTargetHints] ${onError}: ${String(err)}`);
    }
  }

  // High: files from unresolved review_unfixed / recurring_review_finding drift events
  try {
    const driftRows = db.exec(
      `SELECT DISTINCT detail_json FROM memory_drift_events
       WHERE drift_type IN ('review_unfixed', 'recurring_review_finding')
         AND resolved_at IS NULL`,
    );
    for (const row of driftRows[0]?.values ?? []) {
      try {
        const detail = JSON.parse(row[0] as string);
        const ref: string | undefined = detail.target_file_path ?? detail.grouping_value;
        if (ref) add(ref, 'high', 'unresolved review finding drift');
      } catch {
        /* skip malformed detail_json */
      }
    }
  } catch (err) {
    logger.error(`[listReviewTargetHints] drift query failed: ${String(err)}`);
  }

  // High: files with regression fixes in the last 30 days
  addScalarRows(
    `SELECT DISTINCT je.value
     FROM memory_bug_fixes bf, json_each(bf.affected_file_paths_json) je
     WHERE bf.committed_at >= datetime('now', '-30 days')`,
    'high',
    'regression fix in last 30 days',
    'bug query failed',
  );

  // Medium: spec/code files changed in the last 7 days (memory_code_facts)
  addScalarRows(
    `SELECT DISTINCT file_path FROM memory_code_facts
     WHERE last_seen_at >= datetime('now', '-7 days')
     LIMIT 50`,
    'medium',
    'code changed in last 7 days',
    'code query failed',
  );

  // Low: files without a review in the last 90 days
  addScalarRows(
    `SELECT DISTINCT je.value
     FROM memory_code_facts cf, json_each('["' || REPLACE(cf.file_path, ',', '","') || '"]') je
     WHERE cf.file_path NOT IN (
       SELECT DISTINCT rf.target_file_path FROM memory_review_findings rf
       WHERE rf.recorded_at >= datetime('now', '-90 days')
         AND rf.target_file_path IS NOT NULL
     )
     LIMIT 50`,
    'low',
    'no review in last 90 days',
    'unreviewed query failed',
  );

  return results.slice(0, limit);
}
