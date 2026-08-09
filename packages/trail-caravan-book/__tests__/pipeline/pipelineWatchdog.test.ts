import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { runPipelineWatchdog } from '../../src/pipeline/pipelineWatchdog';
import type { CaravanLogger } from '../../src/logger';

const silentLogger: CaravanLogger = {
  info: () => {},
  error: () => {},
};

async function makeCaravanDb(): Promise<BetterSqlite3CaravanDb> {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertRunningRun(db: BetterSqlite3CaravanDb, id: string, scope: string, startedAt: string): void {
  db.run(
    `INSERT INTO caravan_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, scope, startedAt],
  );
}

function setHeartbeat(db: BetterSqlite3CaravanDb, id: string, heartbeatAt: string): void {
  db.run(
    `UPDATE caravan_pipeline_runs SET last_heartbeat_at = ? WHERE id = ?`,
    [heartbeatAt, id],
  );
}

function insertRunningState(db: BetterSqlite3CaravanDb, scope: string): void {
  db.run(
    `INSERT INTO caravan_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES (?, 'running', '', '')`,
    [scope],
  );
}

describe('runPipelineWatchdog', () => {
  test('W1: fresh running run (5 min old) is not touched', async () => {
    const db = await makeCaravanDb();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    insertRunningRun(db, 'run_fresh', 'conversation_backfill', fiveMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(0);
    const rows = db.exec(`SELECT status FROM caravan_pipeline_runs WHERE id = 'run_fresh'`);
    expect(rows[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });

  test('W2: stale running run (15 min old) is flipped to error/timeout', async () => {
    const db = await makeCaravanDb();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    insertRunningRun(db, 'run_stale', 'conversation_backfill', fifteenMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    const rows = db.exec(
      `SELECT status, error_detail, finished_at, duration_ms FROM caravan_pipeline_runs WHERE id = 'run_stale'`,
    );
    const row = rows[0]?.values[0];
    expect(row?.[0]).toBe('error');
    expect(row?.[1]).toBe('timeout');
    expect(row?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number(row?.[3])).toBeGreaterThanOrEqual(15 * 60_000 - 1000);

    db.close();
  });

  test('W3: orphan running state (no matching run) is reset to idle', async () => {
    const db = await makeCaravanDb();
    insertRunningState(db, 'conversation_backfill');
    // No matching caravan_pipeline_runs row.

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_states).toBe(1);
    const rows = db.exec(
      `SELECT status FROM caravan_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(rows[0]?.values[0]?.[0]).toBe('idle');

    db.close();
  });

  test('W4: running state with matching running run is left untouched', async () => {
    const db = await makeCaravanDb();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    insertRunningState(db, 'conversation_backfill');
    insertRunningRun(db, 'run_live', 'conversation_backfill', fiveMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(0);
    expect(result.stale_states).toBe(0);
    const stateRows = db.exec(
      `SELECT status FROM caravan_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(stateRows[0]?.values[0]?.[0]).toBe('running');
    const runRows = db.exec(
      `SELECT status FROM caravan_pipeline_runs WHERE id = 'run_live'`,
    );
    expect(runRows[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });

  test('W6: long-running run with fresh heartbeat is not flipped to error', async () => {
    const db = await makeCaravanDb();
    // started_at is 2 hours ago (would be stale by started_at alone)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    // but heartbeat was updated 1 minute ago — pipeline is alive
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    insertRunningRun(db, 'run_alive', 'conversation_backfill', twoHoursAgo);
    setHeartbeat(db, 'run_alive', oneMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(0);
    const rows = db.exec(`SELECT status FROM caravan_pipeline_runs WHERE id = 'run_alive'`);
    expect(rows[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });

  test('W7: long-running run with stale heartbeat is flipped to error/timeout', async () => {
    const db = await makeCaravanDb();
    // started_at is 2 hours ago and heartbeat was 15 minutes ago — no progress
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    insertRunningRun(db, 'run_dead', 'conversation_backfill', twoHoursAgo);
    setHeartbeat(db, 'run_dead', fifteenMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    const rows = db.exec(
      `SELECT status, error_detail FROM caravan_pipeline_runs WHERE id = 'run_dead'`,
    );
    const row = rows[0]?.values[0];
    expect(row?.[0]).toBe('error');
    expect(row?.[1]).toBe('timeout');

    db.close();
  });

  test('W5: stale run + orphan state for the same scope are both cleaned up', async () => {
    const db = await makeCaravanDb();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    insertRunningState(db, 'conversation_backfill');
    insertRunningRun(db, 'run_stale', 'conversation_backfill', fifteenMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    expect(result.stale_states).toBe(1);

    const runRow = db.exec(`SELECT status FROM caravan_pipeline_runs WHERE id = 'run_stale'`);
    expect(runRow[0]?.values[0]?.[0]).toBe('error');

    const stateRow = db.exec(
      `SELECT status FROM caravan_pipeline_state WHERE scope = 'conversation_backfill'`,
    );
    expect(stateRow[0]?.values[0]?.[0]).toBe('idle');

    db.close();
  });
  it("wave='system' の run は systemTimeoutMinutes 以内なら timeout 扱いにしない", async () => {
    // daemon の生存期間を表す system run は heartbeat 間隔が通常 run より粗い（5 分毎）。
    // 通常 run の timeoutMinutes (10 分) と同条件で失効させると、正常稼働中の daemon が
    // 偽 'timeout' になるため、長い systemTimeoutMinutes (既定 30 分) で判定する。
    const db = await makeCaravanDb();
    const twentyMinAgo = new Date(Date.now() - 20 * 60_000).toISOString();
    db.run(
      `INSERT INTO caravan_pipeline_runs
         (id, scope, wave, tier, started_at, status,
          items_processed, entities_inserted, entities_updated,
          edges_inserted, edges_invalidated, drifts_detected,
          items_failed, duration_ms)
       VALUES ('run_system', 'daemon_session', 'system', 0, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
      [twentyMinAgo],
    );
    // 比較対象: 同じだけ古い通常 run は従来どおり失効する
    insertRunningRun(db, 'run_normal', 'conversation_incremental', twentyMinAgo);

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    const systemRow = db.exec(`SELECT status, error_detail FROM caravan_pipeline_runs WHERE id = 'run_system'`);
    expect(systemRow[0]?.values[0]?.[0]).toBe('running');
    expect(systemRow[0]?.values[0]?.[1]).toBe('');
    const normalRow = db.exec(`SELECT status FROM caravan_pipeline_runs WHERE id = 'run_normal'`);
    expect(normalRow[0]?.values[0]?.[0]).toBe('error');

    db.close();
  });

  it("wave='system' の run も heartbeat が systemTimeoutMinutes を超えて止まればゴーストとして回収する", async () => {
    // リグレッション (2026-08-08 監査): shutdown の finish() を通らず死んだ daemon の
    // daemon_session run が 'running' のまま恒久残留していた（ゴースト 4 件）。
    // daemon は 5 分毎に heartbeat を打つため、長時間止まった run は死んだと判定できる。
    const db = await makeCaravanDb();
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    db.run(
      `INSERT INTO caravan_pipeline_runs
         (id, scope, wave, tier, started_at, status,
          items_processed, entities_inserted, entities_updated,
          edges_inserted, edges_invalidated, drifts_detected,
          items_failed, duration_ms)
       VALUES ('run_ghost', 'daemon_session', 'system', 0, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
      [twoHoursAgo],
    );
    // heartbeat が生きている system run は開始が古くても回収しない
    db.run(
      `INSERT INTO caravan_pipeline_runs
         (id, scope, wave, tier, started_at, status,
          items_processed, entities_inserted, entities_updated,
          edges_inserted, edges_invalidated, drifts_detected,
          items_failed, duration_ms)
       VALUES ('run_alive', 'daemon_session', 'system', 0, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
      [twoHoursAgo],
    );
    setHeartbeat(db, 'run_alive', new Date(Date.now() - 2 * 60_000).toISOString());

    const result = runPipelineWatchdog({ db, timeoutMinutes: 10, logger: silentLogger });

    expect(result.stale_runs).toBe(1);
    const ghostRow = db.exec(`SELECT status, error_detail FROM caravan_pipeline_runs WHERE id = 'run_ghost'`);
    expect(ghostRow[0]?.values[0]?.[0]).toBe('error');
    expect(ghostRow[0]?.values[0]?.[1]).toBe('timeout');
    const aliveRow = db.exec(`SELECT status FROM caravan_pipeline_runs WHERE id = 'run_alive'`);
    expect(aliveRow[0]?.values[0]?.[0]).toBe('running');

    db.close();
  });
});
