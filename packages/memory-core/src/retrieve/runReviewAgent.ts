import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import { randomUUID } from 'crypto';

export type RunReviewAgentInput = {
  db: Database;
  trigger_kind: 'mcp';
  target_kind: string;
  target_refs: string[];
  prompt_kind: string;
  model?: string;
  logger: MemoryLogger;
};

export type RunReviewAgentResult = {
  run_id: string;
};

export function runReviewAgent(input: RunReviewAgentInput): RunReviewAgentResult {
  const { db, trigger_kind, target_kind, target_refs, prompt_kind, logger } = input;
  const model = input.model ?? 'claude-sonnet-4-6';
  const run_id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.run(
      `INSERT INTO memory_review_runs
         (id, trigger_kind, target_kind, target_refs_json, model, prompt_kind,
          prompt_hash, started_at, finished_at, duration_ms, status,
          findings_count, findings_inserted, findings_merged,
          input_tokens, output_tokens, gpu_used, review_id, error_detail, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, NULL, 0, 'running', 0, 0, 0, 0, 0, '', NULL, '', ?)`,
      [run_id, trigger_kind, target_kind, JSON.stringify(target_refs), model, prompt_kind, now, now],
    );
  } catch (err) {
    logger.error(
      `[runReviewAgent] insert failed run_id=${run_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    throw err;
  }

  return { run_id };
}
