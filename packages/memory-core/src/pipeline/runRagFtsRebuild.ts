import type { MemoryDbConnection } from '../db/connection/types';
import {
  upsertEntityFts,
  upsertEpisodeFts,
  upsertDriftFts,
} from '../rag/ftsSync';

export type RunRagFtsRebuildTrigger = 'manual' | 'cron' | 'startup';

export interface RunRagFtsRebuildInput {
  readonly db: MemoryDbConnection;
  readonly trigger: RunRagFtsRebuildTrigger;
  readonly onProgress?: (info: {
    processed: number;
    total: number;
    phase: 'entities' | 'episodes' | 'drift';
  }) => void;
  readonly signal?: AbortSignal;
}

export interface RunRagFtsRebuildResult {
  readonly status: 'success' | 'failed' | 'skipped';
  readonly processed: number;
  readonly error?: string;
}

const PROGRESS_EVERY = 100;

function ts(): string {
  return new Date().toISOString();
}

function log(level: string, message: string, context?: Record<string, unknown>): void {
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [${level}] runRagFtsRebuild ${message}${ctx}`);
}

function generateRunId(): string {
  return `rag_fts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function runRagFtsRebuild(
  input: RunRagFtsRebuildInput,
): Promise<RunRagFtsRebuildResult> {
  const { db, trigger, onProgress, signal } = input;
  const startedAt = ts();
  const startedMs = Date.now();
  const runId = generateRunId();

  // CAS: pipeline_state を確認し、running なら skip
  const currentStatus = db.exec(
    `SELECT status FROM memory_pipeline_state WHERE scope = 'rag_fts_rebuild'`,
  );
  const status = currentStatus[0]?.values[0]?.[0] as string | undefined;
  if (status === 'running') {
    log('INFO', 'skipped (already running)', { trigger });
    return { status: 'skipped', processed: 0 };
  }

  // running に遷移
  db.run(
    `INSERT INTO memory_pipeline_state(scope, status, last_processed_at, error_detail)
       VALUES ('rag_fts_rebuild', 'running', '', '')
     ON CONFLICT(scope) DO UPDATE SET status = 'running', error_detail = ''`,
  );

  // runs テーブルに running 行を作成
  db.run(
    `INSERT INTO memory_pipeline_runs(id, scope, started_at, status) VALUES (?, ?, ?, 'running')`,
    [runId, 'rag_fts_rebuild', startedAt],
  );

  let processed = 0;
  try {
    if (signal?.aborted) throw new Error('aborted');

    // 1. entities (valid_until IS NULL のみ)
    const entityRows = db.exec(
      `SELECT id FROM memory_entities WHERE valid_until IS NULL ORDER BY id`,
    );
    const entityIds = (entityRows[0]?.values ?? []).map((r) => r[0] as string);
    for (let i = 0; i < entityIds.length; i++) {
      if (signal?.aborted) throw new Error('aborted');
      upsertEntityFts(db, entityIds[i]);
      processed++;
      if (i % PROGRESS_EVERY === 0) {
        onProgress?.({ processed, total: entityIds.length, phase: 'entities' });
      }
    }

    // 2. episodes
    const episodeRows = db.exec(`SELECT id FROM memory_episodes ORDER BY id`);
    const episodeIds = (episodeRows[0]?.values ?? []).map((r) => r[0] as string);
    for (let i = 0; i < episodeIds.length; i++) {
      if (signal?.aborted) throw new Error('aborted');
      upsertEpisodeFts(db, episodeIds[i]);
      processed++;
      if (i % PROGRESS_EVERY === 0) {
        onProgress?.({ processed, total: episodeIds.length, phase: 'episodes' });
      }
    }

    // 3. drift events
    const driftRows = db.exec(`SELECT id FROM memory_drift_events ORDER BY id`);
    const driftIds = (driftRows[0]?.values ?? []).map((r) => r[0] as string);
    for (let i = 0; i < driftIds.length; i++) {
      if (signal?.aborted) throw new Error('aborted');
      upsertDriftFts(db, driftIds[i]);
      processed++;
      if (i % PROGRESS_EVERY === 0) {
        onProgress?.({ processed, total: driftIds.length, phase: 'drift' });
      }
    }

    const finishedAt = ts();
    const durationMs = Date.now() - startedMs;
    db.run(
      `UPDATE memory_pipeline_state
         SET status = 'idle', last_processed_at = ?
         WHERE scope = 'rag_fts_rebuild'`,
      [finishedAt],
    );
    db.run(
      `UPDATE memory_pipeline_runs
         SET finished_at = ?, status = 'success', items_processed = ?, duration_ms = ?
         WHERE id = ?`,
      [finishedAt, processed, durationMs, runId],
    );
    log('INFO', 'success', { trigger, processed, durationMs });
    return { status: 'success', processed };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? `\n${error.stack}` : '';
    const detail = `${errMsg}${stack}`;
    const finishedAt = ts();
    const durationMs = Date.now() - startedMs;
    db.run(
      `UPDATE memory_pipeline_state
         SET status = 'error', error_detail = ?
         WHERE scope = 'rag_fts_rebuild'`,
      [detail],
    );
    db.run(
      `UPDATE memory_pipeline_runs
         SET finished_at = ?, status = 'error', items_processed = ?, duration_ms = ?, error_detail = ?
         WHERE id = ?`,
      [finishedAt, processed, durationMs, detail, runId],
    );
    log('ERROR', 'failed', { trigger, processed, error: errMsg });
    return { status: 'failed', processed, error: errMsg };
  }
}
