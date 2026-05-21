import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryDbConnection } from '../../src/db/connection/types';
import { runRagFtsRebuild } from '../../src/pipeline/runRagFtsRebuild';

function makeTmpDb(): string {
  return path.join(
    os.tmpdir(),
    `memory-rag-fts-rebuild-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
}

const TS = '2026-01-01T00:00:00.000Z';

function insertEntity(
  db: MemoryDbConnection,
  id: string,
  canonical: string,
  display: string,
  summary: string,
  validUntil: string | null = null,
): void {
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, summary, aliases_json,
        first_seen_at, last_updated_at, recorded_at, valid_until)
     VALUES (?, 'Function', ?, ?, ?, '[]', ?, ?, ?, ?)`,
    [id, canonical, display, summary, TS, TS, TS, validUntil],
  );
}

function insertEpisode(db: MemoryDbConnection, id: string, raw: string): void {
  db.run(
    `INSERT INTO memory_episodes
       (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model,
        valid_from, recorded_at, raw_excerpt)
     VALUES (?, 'sess', 'm1', 'm2', 'claude_code', 'sonnet', ?, ?, ?)`,
    [id, TS, TS, raw],
  );
}

function insertDrift(db: MemoryDbConnection, id: string, entityId: string, predicate: string): void {
  db.run(
    `INSERT INTO memory_drift_events
       (id, subject_entity_id, predicate, drift_type, severity, detected_at)
     VALUES (?, ?, ?, 'spec_vs_code', 'warn', ?)`,
    [id, entityId, predicate, TS],
  );
}

describe('runRagFtsRebuild', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    const opened = await openMemoryCoreDb(tmpDb);
    db = opened.db;
    close = opened.close;
  });

  afterEach(() => close());

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {
        // ignore
      }
    }
  });

  test('valid_until IS NULL の entities のみが FTS に投入される', async () => {
    insertEntity(db, 'e1', 'active_fn', 'Active Fn', 'active summary', null);
    insertEntity(db, 'e2', 'deleted_fn', 'Deleted Fn', 'deleted summary', TS);

    const result = await runRagFtsRebuild({ db, trigger: 'manual' });

    expect(result.status).toBe('success');
    const matches = db.exec(
      `SELECT e.display_name
         FROM memory_entities e
         JOIN memory_entities_fts f ON e.rowid = f.rowid`,
    );
    const names = (matches[0]?.values ?? []).map((r) => r[0] as string);
    expect(names).toEqual(['Active Fn']);
  });

  test('episodes / drift_events も FTS に投入される', async () => {
    insertEntity(db, 'subj', 'subj', 'Subj', '', null);
    insertEpisode(db, 'ep1', 'The quick fox jumped');
    insertDrift(db, 'd1', 'subj', 'returns');

    const result = await runRagFtsRebuild({ db, trigger: 'manual' });

    expect(result.status).toBe('success');
    const episodeMatch = db.exec(
      `SELECT count(*) FROM memory_episodes_fts WHERE memory_episodes_fts MATCH 'quick'`,
    );
    expect(episodeMatch[0]?.values[0][0]).toBeGreaterThan(0);

    const driftMatch = db.exec(
      `SELECT count(*) FROM memory_drift_events_fts WHERE memory_drift_events_fts MATCH 'returns'`,
    );
    expect(driftMatch[0]?.values[0][0]).toBeGreaterThan(0);
  });

  test('既に running の場合はスキップ', async () => {
    db.run(
      `INSERT INTO memory_pipeline_state(scope, status) VALUES ('rag_fts_rebuild', 'running')`,
    );
    const result = await runRagFtsRebuild({ db, trigger: 'manual' });
    expect(result.status).toBe('skipped');
  });

  test('完了時に memory_pipeline_runs に 1 行 success で記録される', async () => {
    insertEntity(db, 'e1', 'fn', 'Fn', '', null);
    await runRagFtsRebuild({ db, trigger: 'manual' });
    const runs = db.exec(
      `SELECT scope, status FROM memory_pipeline_runs WHERE scope = 'rag_fts_rebuild'`,
    );
    expect(runs[0]?.values).toHaveLength(1);
    expect(runs[0]?.values[0][1]).toBe('success');
  });

  test('完了後 pipeline_state は idle に戻る', async () => {
    await runRagFtsRebuild({ db, trigger: 'manual' });
    const state = db.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'rag_fts_rebuild'`,
    );
    expect(state[0]?.values[0][0]).toBe('idle');
  });

  test('processed カウントが entity + episode + drift の合計', async () => {
    insertEntity(db, 'e1', 'fn1', 'Fn1', '', null);
    insertEntity(db, 'e2', 'fn2', 'Fn2', '', null);
    insertEpisode(db, 'ep1', 'text');
    const result = await runRagFtsRebuild({ db, trigger: 'manual' });
    expect(result.processed).toBe(3);
  });

  test('AbortSignal により aborted になると status=failed が返る', async () => {
    insertEntity(db, 'e1', 'fn', 'Fn', '', null);

    const controller = new AbortController();
    // Pre-abort the signal
    controller.abort();

    const result = await runRagFtsRebuild({ db, trigger: 'manual', signal: controller.signal });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('aborted');

    // pipeline_state should be 'error'
    const state = db.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'rag_fts_rebuild'`,
    );
    expect(state[0]?.values[0][0]).toBe('error');

    // pipeline_runs row should be 'error'
    const runs = db.exec(
      `SELECT status FROM memory_pipeline_runs WHERE scope = 'rag_fts_rebuild'`,
    );
    expect(runs[0]?.values[0][0]).toBe('error');
  });

  test('onProgress callback receives progress notifications for entities and episodes phases', async () => {
    // Insert entities + episode. onProgress fires at i%PROGRESS_EVERY(100)===0,
    // i.e. at i=0 of each phase that has items.
    insertEntity(db, 'e1', 'fn1', 'Fn1', '', null);
    insertEntity(db, 'e2', 'fn2', 'Fn2', '', null);
    insertEpisode(db, 'ep1', 'episode text');

    const progressCalls: Array<{ processed: number; phase: string }> = [];
    const result = await runRagFtsRebuild({
      db,
      trigger: 'cron',
      onProgress: ({ processed, phase }) => { progressCalls.push({ processed, phase }); },
    });

    expect(result.status).toBe('success');
    expect(result.processed).toBe(3); // 2 entities + 1 episode
    // onProgress fires at i=0 for entities (2 entities) and i=0 for episodes (1 episode)
    // So at minimum 2 notifications: entities phase + episodes phase
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    const phases = progressCalls.map((c) => c.phase);
    expect(phases).toContain('entities');
    expect(phases).toContain('episodes');
  });

  test('startup trigger variant → same behaviour as manual', async () => {
    insertEntity(db, 'e1', 'fn', 'Fn', '', null);
    const result = await runRagFtsRebuild({ db, trigger: 'startup' });
    expect(result.status).toBe('success');
    expect(result.processed).toBe(1);
  });

  test('既存 FTS データが置き換わる (冪等)', async () => {
    insertEntity(db, 'e1', 'fn', 'Fn1', 'one', null);
    await runRagFtsRebuild({ db, trigger: 'manual' });

    // entities テーブルを変更 → 再構築すると FTS に反映される
    db.run(`UPDATE memory_entities SET display_name = 'Fn2' WHERE id = 'e1'`);
    await runRagFtsRebuild({ db, trigger: 'manual' });

    const r = db.exec(
      `SELECT count(*) FROM memory_entities_fts WHERE memory_entities_fts MATCH 'Fn2'`,
    );
    expect(r[0]?.values[0][0]).toBe(1);
    const r2 = db.exec(
      `SELECT count(*) FROM memory_entities_fts WHERE memory_entities_fts MATCH 'Fn1'`,
    );
    expect(r2[0]?.values[0][0]).toBe(0);
  });
});
