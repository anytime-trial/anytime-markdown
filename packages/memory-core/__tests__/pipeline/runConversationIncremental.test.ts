import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationIncremental } from '../../src/pipeline/runConversationIncremental';
import { episodeId } from '../../src/ingest/conversation/persist';
import type { MemoryLogger } from '../../src/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeMemoryDb(): Promise<BetterSqlite3MemoryDb> {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(): BetterSqlite3MemoryDb {
  const trailDb = BetterSqlite3MemoryDb.openInMemory();
  trailDb.run(`CREATE TABLE sessions (id TEXT PRIMARY KEY) STRICT`);
  trailDb.run(
    `CREATE TABLE messages (
       uuid TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       type TEXT NOT NULL,
       timestamp TEXT NOT NULL,
       text_content TEXT,
       user_content TEXT
     ) STRICT`
  );
  return trailDb;
}

function insertSession(trailDb: BetterSqlite3MemoryDb, id: string): void {
  trailDb.run(`INSERT INTO sessions VALUES (?)`, [id]);
}

function insertMessage(
  trailDb: BetterSqlite3MemoryDb,
  uuid: string,
  sessionId: string,
  type: string,
  timestamp: string,
  excerpt: string
): void {
  const isUser = type === 'user';
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid, sessionId, type, timestamp, isUser ? null : excerpt, isUser ? excerpt : null]
  );
}

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

function makeValidOllama(responseObj?: object) {
  const response = JSON.stringify(
    responseObj ?? {
      summary: 'Test extraction',
      entities: [{ type: 'Tool', name: 'jest', aliases: [], tags: [], attributes: {} }],
      relations: [],
      questions: [],
    }
  );
  return {
    generate: jest.fn().mockResolvedValue({ response }),
    embeddings: jest.fn(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runConversationIncremental', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── I1: basic happy path ─────────────────────────────────────────────────
  test('I1: 1 session, 2 messages → entities_inserted ≥ 1, pipeline_state updated', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess1');
    insertMessage(trailDb, 'msg1', 'sess1', 'user', '2026-01-01T00:00:00.000Z', 'hello world');
    insertMessage(trailDb, 'msg2', 'sess1', 'assistant', '2026-01-01T00:01:00.000Z', 'hello back');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.entities_inserted).toBeGreaterThanOrEqual(1);
    expect(result.items_processed).toBeGreaterThanOrEqual(1);

    // pipeline_state should be updated
    const stateRows = memDb.exec(
      `SELECT scope, status, last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
    );
    expect(stateRows[0]?.values).toHaveLength(1);
    const stateRow = stateRows[0].values[0];
    expect(stateRow[1]).toBe('idle');
    // last_processed_at should be a valid ISO timestamp (not the epoch default)
    expect(stateRow[2] as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // pipeline_run row should exist with status=success
    const runRows = memDb.exec(
      `SELECT status FROM memory_pipeline_runs WHERE scope = 'conversation_incremental'`
    );
    expect(runRows[0]?.values[0]?.[0]).toBe('success');

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I2: idempotency — 2nd run inserts no new entities ───────────────────
  test('I2: running twice with same data → 2nd run entities_inserted = 0', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess1');
    insertMessage(trailDb, 'msg1', 'sess1', 'user', '2026-01-01T00:00:00.000Z', 'hello world');
    insertMessage(trailDb, 'msg2', 'sess1', 'assistant', '2026-01-01T00:01:00.000Z', 'hello back');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();

    // First run
    const result1 = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });
    expect(result1.entities_inserted).toBeGreaterThanOrEqual(1);

    // Second run — same trail data, but pipeline_state.last_processed_at is now
    // after these messages, so no new episodes to process
    const result2 = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });
    expect(result2.entities_inserted).toBe(0);
    expect(result2.items_processed).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I3: LLM returns invalid JSON → failed_items recorded, continues ──────
  test('I3: first episode LLM returns invalid JSON → failed item recorded, no crash', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // Two sessions → two separate episodes (so second one can succeed)
    insertSession(trailDb, 'sess-fail');
    insertMessage(trailDb, 'fail1', 'sess-fail', 'user', '2026-01-01T00:00:00.000Z', 'trigger fail');

    insertSession(trailDb, 'sess-ok');
    insertMessage(trailDb, 'ok1', 'sess-ok', 'user', '2026-01-01T01:00:00.000Z', 'normal message');

    attachTrailDbFromHandle(memDb, trailDb);

    // First call returns invalid JSON, second call returns valid JSON
    const validResponse = JSON.stringify({
      summary: 'OK',
      entities: [{ type: 'Tool', name: 'vitest', aliases: [], tags: [], attributes: {} }],
      relations: [],
      questions: [],
    });
    const ollama = {
      generate: jest.fn()
        .mockResolvedValueOnce({ response: 'not valid json' })
        .mockResolvedValueOnce({ response: validResponse }),
      embeddings: jest.fn(),
    };

    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.items_failed).toBeGreaterThanOrEqual(1);

    // failed_items table should have 1 row
    const failRows = memDb.exec(
      `SELECT COUNT(*) FROM memory_failed_items WHERE scope = 'conversation_incremental'`
    );
    expect(failRows[0]?.values[0]?.[0]).toBeGreaterThanOrEqual(1);

    // Second episode should have succeeded → entities_inserted ≥ 1
    expect(result.entities_inserted).toBeGreaterThanOrEqual(1);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I4: 3 consecutive failures → quarantine ──────────────────────────────
  test('I4: 3 consecutive LLM failures → pipeline_state.status = quarantine', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // Three sessions, each with one user message → three separate episodes
    for (let i = 1; i <= 3; i++) {
      insertSession(trailDb, `sess-q${i}`);
      insertMessage(
        trailDb,
        `fail${i}`,
        `sess-q${i}`,
        'user',
        `2026-01-01T0${i}:00:00.000Z`,
        `fail message ${i}`
      );
    }

    attachTrailDbFromHandle(memDb, trailDb);

    // All 3 generate calls return invalid JSON
    const ollama = {
      generate: jest.fn().mockResolvedValue({ response: 'bad json' }),
      embeddings: jest.fn(),
    };

    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('partial');
    expect(result.items_failed).toBeGreaterThanOrEqual(3);

    const stateRows = memDb.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
    );
    expect(stateRows[0]?.values[0]?.[0]).toBe('quarantine');

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I5: checkpoint persists items_processed mid-run BUT does NOT advance
  // the cursor. Cursor advancement is reserved for completion / quarantine to
  // guarantee that an interrupted run can never silently skip unprocessed
  // sessions (existingIds preload is the authoritative skip on resume).
  test('I5: checkpoint persists items_processed before save() fires; cursor stays put', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // Seed an existing cursor so we can assert it doesn't move mid-run.
    const initialCursor = '2026-01-01T00:00:00.000Z';
    memDb.run(
      `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
       VALUES ('conversation_incremental', 'idle', ?, '')`,
      [initialCursor]
    );

    // 60 user messages across 60 sessions → 60 episodes, > 1 checkpoint interval (50)
    const N = 60;
    for (let i = 0; i < N; i++) {
      const sessId = `sess_chk_${i.toString().padStart(3, '0')}`;
      insertSession(trailDb, sessId);
      const ts = new Date(Date.UTC(2026, 0, 2, 0, i, 0)).toISOString();
      insertMessage(trailDb, `msg_chk_${i}`, sessId, 'user', ts, `chk message ${i}`);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();

    type Snapshot = { items_processed: number; last_processed_at: string };
    const snapshots: Snapshot[] = [];
    const save = (): void => {
      const runRows = memDb.exec(
        `SELECT items_processed FROM memory_pipeline_runs
         WHERE scope = 'conversation_incremental'
         ORDER BY started_at DESC LIMIT 1`
      );
      const stateRows = memDb.exec(
        `SELECT last_processed_at FROM memory_pipeline_state
         WHERE scope = 'conversation_incremental'`
      );
      snapshots.push({
        items_processed: (runRows[0]?.values[0]?.[0] as number) ?? -1,
        last_processed_at: (stateRows[0]?.values[0]?.[0] as string) ?? '',
      });
    };

    await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
      save,
    });

    // save() is called every PROGRESS_LOG_INTERVAL (=50) episodes, so we
    // expect at least one mid-run snapshot at the 50-episode mark.
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const first = snapshots[0];

    // items_processed MUST be persisted — otherwise UI shows 0 forever.
    expect(first.items_processed).toBe(50);
    // last_processed_at MUST NOT have moved mid-run. Otherwise a reload at
    // this moment would skip the remaining 10 unprocessed episodes whose
    // timestamps lie before the artificial mid-run cursor advance.
    expect(first.last_processed_at).toBe(initialCursor);

    trailDb.close();
    memDb.close();
  }, 60000);

  // ── I9: reload-correctness — cursor must NOT advance past unprocessed
  // sessions mid-run. We construct 51 sessions ordered so the FIRST few
  // sessions chronologically have the LATEST timestamps (the buggy pattern:
  // UUID order ≠ time order). At the 50-episode checkpoint, the old code
  // would have already persisted cursor = max(timestamps seen so far) which
  // jumps past sessions yet to be iterated.
  test('I9: cursor stays at initial during mid-run checkpoint (51 episodes)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    const initialCursor = '2026-01-01T00:00:00.000Z';
    memDb.run(
      `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
       VALUES ('conversation_incremental', 'idle', ?, '')`,
      [initialCursor]
    );

    // 51 user messages → 51 episodes. PROGRESS_LOG_INTERVAL=50 fires once
    // mid-run at episode 50. The save() callback observes cursor THEN.
    const N = 51;
    for (let i = 0; i < N; i++) {
      const sessId = `sess_i9_${i.toString().padStart(3, '0')}`;
      insertSession(trailDb, sessId);
      const ts = new Date(Date.UTC(2026, 0, 2, 0, i, 0)).toISOString();
      insertMessage(trailDb, `msg_i9_${i}`, sessId, 'user', ts, `i9 msg ${i}`);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const cursorSnapshots: string[] = [];
    const save = (): void => {
      const rows = memDb.exec(
        `SELECT last_processed_at FROM memory_pipeline_state
         WHERE scope = 'conversation_incremental'`
      );
      cursorSnapshots.push((rows[0]?.values[0]?.[0] as string) ?? '');
    };

    await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
      save,
    });

    // At least one mid-run snapshot must have been taken.
    expect(cursorSnapshots.length).toBeGreaterThanOrEqual(1);
    // Every mid-run observation must show the initial cursor — proving the
    // run cannot leak an over-advanced cursor on reload.
    for (const c of cursorSnapshots) {
      expect(c).toBe(initialCursor);
    }

    trailDb.close();
    memDb.close();
  }, 60000);

  // ── I6: resumed run skips already-persisted episodes via existingIds preload
  // Regression: incremental had no existingIds defense, so a resume after a
  // partial run re-fed every already-persisted episode to Ollama (idempotent
  // on the DB but wasted minutes of LLM time per episode).
  test('I6: pre-persisted episodes are skipped on resume, no Ollama call', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // 3 user messages in trail + matching memory_episodes rows (as if a
    // prior run had already persisted them, then the cursor was lost).
    for (let i = 0; i < 3; i++) {
      const sessId = `sess_pre_${i}`;
      const msgUuid = `msg_pre_${i}`;
      const ts = `2026-02-01T0${i}:00:00.000Z`;
      insertSession(trailDb, sessId);
      insertMessage(trailDb, msgUuid, sessId, 'user', ts, `pre msg ${i}`);
      const epId = episodeId(sessId, msgUuid);
      memDb.run(
        `INSERT INTO memory_episodes
           (id, session_id, message_uuid_start, message_uuid_end,
            agent_runtime, model, valid_from, recorded_at, raw_excerpt)
         VALUES (?, ?, ?, ?, 'claude_code', 'unknown', ?, ?, '')`,
        [epId, sessId, msgUuid, msgUuid, ts, ts]
      );
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(ollama.generate).not.toHaveBeenCalled();
    expect(result.entities_inserted).toBe(0);

    // last_processed_at must still advance even though every episode was
    // skipped (otherwise convTotalEstimate stays high after reload).
    const stateRows = memDb.exec(
      `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
    );
    const lastProcessedAt = stateRows[0]?.values[0]?.[0] as string;
    expect(lastProcessedAt > '2026-02-01T02:00:00.000Z').toBe(true);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I7: last_heartbeat_at must be populated so pipelineWatchdog can
  // detect a truly stale incremental run. Backfill writes it on insert and on
  // every progress checkpoint; incremental must do the same or the watchdog
  // (which falls back to started_at) keeps the orphan 'running' row alive for
  // the full 10-minute timeout window after a reload.
  test('I7: insertPipelineRun seeds last_heartbeat_at and progress checkpoints refresh it', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess-hb');
    insertMessage(trailDb, 'hb1', 'sess-hb', 'user', '2026-01-01T00:00:00.000Z', 'heartbeat probe');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');

    const rows = memDb.exec(
      `SELECT started_at, last_heartbeat_at
         FROM memory_pipeline_runs
        WHERE scope = 'conversation_incremental'`
    );
    expect(rows[0]?.values).toHaveLength(1);
    const startedAt = rows[0].values[0][0] as string;
    const lastHeartbeatAt = rows[0].values[0][1] as string | null;
    expect(lastHeartbeatAt).not.toBeNull();
    expect(lastHeartbeatAt as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Must be >= started_at (heartbeat is refreshed during/after the run).
    expect(lastHeartbeatAt as string >= startedAt).toBe(true);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── I8: progress() callback must fire for every episode (not just every
  // PROGRESS_LOG_INTERVAL=50 episodes). Otherwise the UI shows "0/N" frozen
  // for ~8 minutes on a 50-episode-per-checkpoint cadence, which users
  // mistake for the pipeline being stuck and trigger a reload that loses
  // partial work.
  test('I8: progress callback fires per episode (not every 50)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // 5 sessions × 1 user message each = 5 episodes.
    for (let i = 0; i < 5; i++) {
      const sid = `sess-prog-${i}`;
      insertSession(trailDb, sid);
      insertMessage(
        trailDb,
        `prog-${i}`,
        sid,
        'user',
        `2026-01-01T0${i}:00:00.000Z`,
        `body ${i}`
      );
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const progressCalls: Array<{ processed: number; failed: number }> = [];

    const result = await runConversationIncremental({
      db: memDb,
      ollama,
      logger: silentLogger,
      progress: (processed, failed) => {
        progressCalls.push({ processed, failed });
      },
    });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(5);

    // Must have fired at least once per episode (5+), and the processed counter
    // must be strictly monotonic across calls.
    expect(progressCalls.length).toBeGreaterThanOrEqual(5);
    expect(progressCalls.map((c) => c.processed)).toEqual([1, 2, 3, 4, 5]);

    trailDb.close();
    memDb.close();
  }, 30000);
});
