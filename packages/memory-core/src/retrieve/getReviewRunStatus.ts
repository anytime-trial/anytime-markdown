import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';

export type ReviewRunStatus = {
  run_id: string;
  trigger_kind: string;
  target_kind: string;
  target_refs: string[];
  model: string;
  prompt_kind: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number;
  status: string;
  findings_count: number;
  findings_inserted: number;
  findings_merged: number;
  input_tokens: number;
  output_tokens: number;
  review_id: string | null;
  error_detail: string;
};

export function getReviewRunStatus(input: {
  db: Database;
  run_id: string;
  logger: MemoryLogger;
}): ReviewRunStatus | null {
  const { db, run_id, logger } = input;

  let rows: ReturnType<Database['exec']>;
  try {
    rows = db.exec(
      `SELECT id, trigger_kind, target_kind, target_refs_json, model, prompt_kind,
              started_at, finished_at, duration_ms, status,
              findings_count, findings_inserted, findings_merged,
              input_tokens, output_tokens, review_id, error_detail
       FROM memory_review_runs WHERE id = ?`,
      [run_id],
    );
  } catch (err) {
    logger.error(
      `[getReviewRunStatus] query failed run_id=${run_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return null;
  }

  if (!rows[0]?.values?.length) return null;

  const row = rows[0].values[0];
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
}
