import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type ReviewTargetHint = {
  target_ref: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
};

export function listReviewTargetHints(input: {
  db: Database;
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
  try {
    const bugRows = db.exec(
      `SELECT DISTINCT je.value
       FROM memory_bug_fixes bf, json_each(bf.affected_file_paths_json) je
       WHERE bf.committed_at >= datetime('now', '-30 days')`,
    );
    for (const row of bugRows[0]?.values ?? []) {
      const ref = row[0] as string;
      if (ref) add(ref, 'high', 'regression fix in last 30 days');
    }
  } catch (err) {
    logger.error(`[listReviewTargetHints] bug query failed: ${String(err)}`);
  }

  // Medium: spec/code files changed in the last 7 days (memory_code_facts)
  try {
    const codeRows = db.exec(
      `SELECT DISTINCT file_path FROM memory_code_facts
       WHERE last_seen_at >= datetime('now', '-7 days')
       LIMIT 50`,
    );
    for (const row of codeRows[0]?.values ?? []) {
      const ref = row[0] as string;
      if (ref) add(ref, 'medium', 'code changed in last 7 days');
    }
  } catch (err) {
    logger.error(`[listReviewTargetHints] code query failed: ${String(err)}`);
  }

  // Low: files without a review in the last 90 days
  try {
    const unreviewed = db.exec(
      `SELECT DISTINCT je.value
       FROM memory_code_facts cf, json_each('["' || REPLACE(cf.file_path, ',', '","') || '"]') je
       WHERE cf.file_path NOT IN (
         SELECT DISTINCT rf.target_file_path FROM memory_review_findings rf
         WHERE rf.recorded_at >= datetime('now', '-90 days')
           AND rf.target_file_path IS NOT NULL
       )
       LIMIT 50`,
    );
    for (const row of unreviewed[0]?.values ?? []) {
      const ref = row[0] as string;
      if (ref) add(ref, 'low', 'no review in last 90 days');
    }
  } catch (err) {
    logger.error(`[listReviewTargetHints] unreviewed query failed: ${String(err)}`);
  }

  return results.slice(0, limit);
}
