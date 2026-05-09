import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import type { ReviewRunStatus } from './getReviewRunStatus';

export function listReviewRuns(input: {
  db: Database;
  trigger_kind?: string;
  status?: string;
  target_kind?: string;
  model?: string;
  since?: string;
  limit?: number;
  logger: MemoryLogger;
}): ReviewRunStatus[] {
  const { db, limit = 20, logger } = input;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (input.trigger_kind != null) {
    conditions.push('trigger_kind = ?');
    params.push(input.trigger_kind);
  }
  if (input.status != null) {
    conditions.push('status = ?');
    params.push(input.status);
  }
  if (input.target_kind != null) {
    conditions.push('target_kind = ?');
    params.push(input.target_kind);
  }
  if (input.model != null) {
    conditions.push('model = ?');
    params.push(input.model);
  }
  if (input.since != null) {
    conditions.push('started_at >= ?');
    params.push(input.since);
  }
  params.push(limit);

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT id, trigger_kind, target_kind, target_refs_json, model, prompt_kind,
              started_at, finished_at, duration_ms, status,
              findings_count, findings_inserted, findings_merged,
              input_tokens, output_tokens, review_id, error_detail
       FROM memory_review_runs
       ${where}
       ORDER BY started_at DESC
       LIMIT ?`,
      params,
    );
  } catch (err) {
    logger.error(
      `[listReviewRuns] query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  return (rows[0]?.values ?? []).map((row) => {
    let targetRefs: string[] = [];
    try {
      targetRefs = JSON.parse(row[3] as string);
    } catch {
      targetRefs = [];
    }
    return {
      run_id: row[0] as string,
      trigger_kind: row[1] as string,
      target_kind: row[2] as string,
      target_refs: targetRefs,
      model: row[4] as string,
      prompt_kind: row[5] as string,
      started_at: row[6] as string,
      finished_at: row[7] as string | null,
      duration_ms: row[8] as number,
      status: row[9] as string,
      findings_count: row[10] as number,
      findings_inserted: row[11] as number,
      findings_merged: row[12] as number,
      input_tokens: row[13] as number,
      output_tokens: row[14] as number,
      review_id: row[15] as string | null,
      error_detail: row[16] as string,
    };
  });
}
