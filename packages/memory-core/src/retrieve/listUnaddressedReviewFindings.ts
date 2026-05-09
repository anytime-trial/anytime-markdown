import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type UnaddressedReviewFinding = {
  finding_id: string;
  review_id: string;
  category: string;
  severity: string;
  finding_text: string;
  suggestion_text: string;
  target_file_path: string | null;
  target_symbol: string | null;
  recorded_at: string;
};

export function listUnaddressedReviewFindings(input: {
  db: Database;
  severity?: string;
  daysSinceMin?: number;
  target_file_path?: string;
  category?: string;
  limit?: number;
  logger: MemoryLogger;
}): UnaddressedReviewFinding[] {
  const { db, limit = 50, logger } = input;

  const conditions: string[] = ['rf.addressed_at IS NULL'];
  const params: (string | number)[] = [];

  if (input.severity != null) {
    conditions.push('rf.severity = ?');
    params.push(input.severity);
  }
  if (input.daysSinceMin != null) {
    conditions.push(`rf.recorded_at <= datetime('now', '-' || ? || ' days')`);
    params.push(input.daysSinceMin);
  }
  if (input.target_file_path != null) {
    conditions.push('rf.target_file_path = ?');
    params.push(input.target_file_path);
  }
  if (input.category != null) {
    conditions.push('rf.category = ?');
    params.push(input.category);
  }
  params.push(limit);

  const where = conditions.join(' AND ');
  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT rf.id, rf.review_id, rf.category, rf.severity,
              rf.finding_text, rf.suggestion_text,
              rf.target_file_path, rf.target_symbol, rf.recorded_at
       FROM memory_review_findings rf
       WHERE ${where}
       ORDER BY rf.recorded_at ASC
       LIMIT ?`,
      params,
    );
  } catch (err) {
    logger.error(
      `[listUnaddressedReviewFindings] query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  return (rows[0]?.values ?? []).map((row) => ({
    finding_id: row[0] as string,
    review_id: row[1] as string,
    category: row[2] as string,
    severity: row[3] as string,
    finding_text: row[4] as string,
    suggestion_text: row[5] as string,
    target_file_path: row[6] as string | null,
    target_symbol: row[7] as string | null,
    recorded_at: row[8] as string,
  }));
}
