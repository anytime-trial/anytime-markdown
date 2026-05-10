import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { runPipelineWatchdog } from '../../src/pipeline/pipelineWatchdog';
import type { MemoryLogger } from '../../src/logger';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

async function makeMemoryDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertRunningRun(db: Database, id: string, scope: string, startedAt: string): void {
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, scope, startedAt],
  );
}

function insertRunningState(db: Database, scope: string): void {
  db.run(
    `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES (?, 'running', '', '')`,
    [scope],
  );
}

describe('runPipelineWatchdog', () => {
  test('W1: fresh running run (5 min old) is not touched', async () => {
    const db = await makeMemoryDb();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    insertRunningRun(db, 'run_fresh', 'conversation_backfill', fiveMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(0);
    const rows = db.exec(`SELECT status FROM memory_pipeline_runs WHERE id = 'run_fresh'`);
    expect(rows[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });

  test('W2: stale running run (15 min old) is flipped to error/timeout', async () => {
    const db = await makeMemoryDb();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    insertRunningRun(db, 'run_stale', 'conversation_backfill', fifteenMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    const rows = db.exec(
      `SELECT status, error_detail, finished_at, duration_ms FROM memory_pipeline_runs WHERE id = 'run_stale'`,
    );
    const row = rows[0]?.values[0];
    expect(row?.[0]).toBe('error');
    expect(row?.[1]).toBe('timeout');
    expect(row?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number(row?.[3])).toBeGreaterThanOrEqual(15 * 60_000 - 1000);

    db.close();
  });

  test('W3: orphan running state (no matching run) is reset to idle', async () => {
    const db = await makeMemoryDb();
    insertRunningState(db, 'conversation_backfill');
    // No matching memory_pipeline_runs row.

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_states).toBe(1);
    const rows = db.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(rows[0]?.values[0]?.[0]).toBe('idle');

    db.close();
  });

  test('W4: running state with matching running run is left untouched', async () => {
    const db = await makeMemoryDb();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    insertRunningState(db, 'conversation_backfill');
    insertRunningRun(db, 'run_live', 'conversation_backfill', fiveMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(0);
    expect(result.stale_states).toBe(0);
    const stateRows = db.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(stateRows[0]?.values[0]?.[0]).toBe('running');
    const runRows = db.exec(
      `SELECT status FROM memory_pipeline_runs WHERE id = 'run_live'`,
    );
    expect(runRows[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });

  test('W5: stale run + orphan state for the same scope are both cleaned up', async () => {
    const db = await makeMemoryDb();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    insertRunningState(db, 'conversation_backfill');
    insertRunningRun(db, 'run_stale', 'conversation_backfill', fifteenMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    expect(result.stale_states).toBe(1);

    const runRow = db.exec(`SELECT status FROM memory_pipeline_runs WHERE id = 'run_stale'`);
    expect(runRow[0]?.values[0]?.[0]).toBe('error');

    const stateRow = db.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(stateRow[0]?.values[0]?.[0]).toBe('idle');

    db.close();
  });
});
