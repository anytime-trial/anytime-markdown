import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationBackfill } from '../../src/pipeline/runConversationBackfill';
import type { MemoryLogger } from '../../src/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeMemoryDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(
  SQL: ReturnType<typeof initSqlJs> extends Promise<infer T> ? T : never
): Database {
  const trailDb = new SQL.Database();
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

function insertSession(trailDb: Database, id: string): void {
  trailDb.run(`INSERT INTO sessions VALUES (?)`, [id]);
}

function insertMessage(
  trailDb: Database,
  uuid: string,
  sessionId: string,
  type: string,
  timestamp: string,
  excerpt: string
): void {
  // trail-db importSession の規約に合わせて type 別に列を使い分ける。
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

describe('runConversationBackfill', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  // Timestamps relative to "now"
  const ts8DaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const ts6DaysAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const ts1DayAgo = new Date(Date.now() - 1 * 86_400_000).toISOString();

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── B1: 7-day window excludes old message ─────────────────────────────────
  test('B1: 7-day window excludes 8-day-old message, processes 6-day and 1-day → items_processed = 2', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    // 3 separate sessions, 1 user message each
    insertSession(trailDb, 'sess_old');
    insertMessage(trailDb, 'msg_old', 'sess_old', 'user', ts8DaysAgo, 'old message outside window');

    insertSession(trailDb, 'sess_mid');
    insertMessage(trailDb, 'msg_mid', 'sess_mid', 'user', ts6DaysAgo, 'mid message inside window');

    insertSession(trailDb, 'sess_recent');
    insertMessage(trailDb, 'msg_recent', 'sess_recent', 'user', ts1DayAgo, 'recent message inside window');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    // Only 2 sessions fall within the 7-day window
    expect(result.items_processed).toBe(2);
    expect(result.entities_inserted).toBeGreaterThanOrEqual(1);

    // pipeline_state for backfill should be updated
    const stateRows = memDb.exec(
      `SELECT scope, status, last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_backfill'`
    );
    expect(stateRows[0]?.values).toHaveLength(1);
    const stateRow = stateRows[0].values[0];
    expect(stateRow[1]).toBe('idle');
    expect(stateRow[2] as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // pipeline_run row should exist with scope=conversation_backfill and status=success
    const runRows = memDb.exec(
      `SELECT status FROM memory_pipeline_runs WHERE scope = 'conversation_backfill'`
    );
    expect(runRows[0]?.values[0]?.[0]).toBe('success');

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── B2: idempotency — 2nd run inserts no new entities ─────────────────────
  test('B2: running backfill twice → 2nd run entities_inserted = 0 (idempotent upsert)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertSession(trailDb, 'sess_mid');
    insertMessage(trailDb, 'msg_mid', 'sess_mid', 'user', ts6DaysAgo, 'mid message');

    insertSession(trailDb, 'sess_recent');
    insertMessage(trailDb, 'msg_recent', 'sess_recent', 'user', ts1DayAgo, 'recent message');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();

    // First backfill
    const result1 = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });
    expect(result1.status).toBe('success');
    expect(result1.entities_inserted).toBeGreaterThanOrEqual(1);

    // Second backfill — same data, same time window, entities already exist
    const result2 = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });
    expect(result2.status).toBe('success');
    expect(result2.entities_inserted).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── B3: incremental cursor is advanced after backfill ─────────────────────
  test('B3: after backfill, pipeline_state scope=conversation_incremental last_processed_at is advanced', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertSession(trailDb, 'sess_recent');
    insertMessage(trailDb, 'msg_recent', 'sess_recent', 'user', ts1DayAgo, 'recent message');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');

    // incremental pipeline_state should have been created/updated
    const stateRows = memDb.exec(
      `SELECT scope, status, last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
    );
    expect(stateRows[0]?.values).toHaveLength(1);
    const lastProcessedAt = stateRows[0].values[0][2] as string;
    // Should be a valid ISO timestamp that is after the recent message timestamp
    expect(lastProcessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Should be at or after ts1DayAgo
    expect(lastProcessedAt >= ts1DayAgo).toBe(true);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── B4: progress log emitted every 10 episodes ────────────────────────────
  test('B4: progress log is emitted at 10-episode intervals', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    // Insert 100 sessions each with 1 user message to trigger progress log
    const baseTime = Date.now() - 3 * 86_400_000; // 3 days ago
    for (let i = 0; i < 100; i++) {
      const sessId = `sess_${i.toString().padStart(3, '0')}`;
      const ts = new Date(baseTime + i * 1000).toISOString();
      insertSession(trailDb, sessId);
      insertMessage(trailDb, `msg_${i}`, sessId, 'user', ts, `message ${i}`);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const infoMessages: string[] = [];
    const trackingLogger: MemoryLogger = {
      info: (msg: string) => { infoMessages.push(msg); },
      error: () => {},
    };

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: trackingLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(100);

    // PROGRESS_LOG_INTERVAL = 10 → 10 progress logs at 10, 20, ..., 100
    const progressLogs = infoMessages.filter((m) =>
      m.includes('[memory-core] backfill progress:')
    );
    expect(progressLogs).toHaveLength(10);
    expect(progressLogs[progressLogs.length - 1]).toContain('100/100 episodes');

    trailDb.close();
    memDb.close();
  }, 60000);

  // ── B6: last_heartbeat_at is updated during backfill ──────────────────────
  test('B6: last_heartbeat_at on memory_pipeline_runs is non-null after backfill', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertSession(trailDb, 'sess_recent');
    insertMessage(trailDb, 'msg_recent', 'sess_recent', 'user', ts1DayAgo, 'recent message');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');

    // last_heartbeat_at must be populated (initialized at insertPipelineRun,
    // then refreshed at each session start). It should match the ISO 8601
    // format enforced by the migration 010 GLOB CHECK.
    const rows = memDb.exec(
      `SELECT last_heartbeat_at FROM memory_pipeline_runs WHERE scope = 'conversation_backfill'`
    );
    const heartbeat = rows[0]?.values[0]?.[0] as string | null;
    expect(heartbeat).not.toBeNull();
    expect(heartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── B7: resumed run skips sessions older than last_processed_at ───────────
  test('B7: resumed backfill with last_processed_at uses it as sinceISO (skips older sessions)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    // 6 days ago session — first run will process it
    insertSession(trailDb, 'sess_mid');
    insertMessage(trailDb, 'msg_mid', 'sess_mid', 'user', ts6DaysAgo, 'mid message');

    // 1 day ago session — both runs see it
    insertSession(trailDb, 'sess_recent');
    insertMessage(trailDb, 'msg_recent', 'sess_recent', 'user', ts1DayAgo, 'recent message');

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    // First run: window=7 days → processes both sessions
    const r1 = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });
    expect(r1.items_processed).toBe(2);

    // Simulate a resumed run. The state.last_processed_at should now be
    // around ts1DayAgo (the latest valid_from from the first run + 1ms via
    // the finalize step). A 7-day window would normally still include
    // ts6DaysAgo, but computeSinceISO must pick last_processed_at because it
    // is newer. So sess_mid is now outside the resumed window.
    // existingIds skip would have caught the episodes individually anyway,
    // but the test asserts the structural improvement: items_skipped stays 0
    // because sess_mid is no longer visited at all (it's filtered out by SQL).
    const r2 = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });
    expect(r2.status).toBe('success');
    // sess_mid is filtered out by sinceISO (newer than ts6DaysAgo).
    // sess_recent's episode is already in existingIds → items_skipped counts it.
    expect(r2.items_processed).toBe(0);
    expect(r2.items_skipped).toBeLessThanOrEqual(1);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── B8: extract concurrency parallelizes Ollama calls ─────────────────────
  test('B8: MEMORY_CORE_EXTRACT_CONCURRENCY=4 runs up to 4 extract calls in parallel', async () => {
    const oldEnv = process.env.MEMORY_CORE_EXTRACT_CONCURRENCY;
    process.env.MEMORY_CORE_EXTRACT_CONCURRENCY = '4';
    try {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb(SQL);

      // 1 session containing 8 user messages → splitEpisodes yields 8 episodes
      // within a single session. Parallel batching happens per-session.
      insertSession(trailDb, 'sess_b8');
      for (let i = 0; i < 8; i++) {
        const ts = new Date(Date.now() - 86_400_000 + i * 1000).toISOString();
        insertMessage(trailDb, `msg_b8_${i}`, 'sess_b8', 'user', ts, `body ${i}`);
      }
      attachTrailDbFromHandle(memDb, trailDb);

      let inFlight = 0;
      let maxInFlight = 0;
      const generate = jest.fn().mockImplementation(async () => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        // Small delay so multiple in-flight promises overlap.
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
        return {
          response: JSON.stringify({
            summary: 'test',
            entities: [{ type: 'Tool', name: 'jest', aliases: [], tags: [], attributes: {} }],
            relations: [],
            questions: [],
          }),
        };
      });
      const ollama = { generate, embeddings: jest.fn() };

      const result = await runConversationBackfill({
        db: memDb,
        ollama,
        sinceDays: 7,
        logger: silentLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_processed).toBe(8);
      // Parallel batching occurred (more than 1 in flight at some point).
      expect(maxInFlight).toBeGreaterThanOrEqual(2);
      // Never exceeds the configured concurrency.
      expect(maxInFlight).toBeLessThanOrEqual(4);

      trailDb.close();
      memDb.close();
    } finally {
      if (oldEnv === undefined) {
        delete process.env.MEMORY_CORE_EXTRACT_CONCURRENCY;
      } else {
        process.env.MEMORY_CORE_EXTRACT_CONCURRENCY = oldEnv;
      }
    }
  }, 30000);

  // ── B5: 3 consecutive failures → quarantine ───────────────────────────────
  test('B5: 3 consecutive LLM failures → pipeline_state.status = quarantine', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    for (let i = 1; i <= 3; i++) {
      const sessId = `sess_q${i}`;
      const ts = new Date(Date.now() - (4 - i) * 86_400_000).toISOString();
      insertSession(trailDb, sessId);
      insertMessage(trailDb, `fail${i}`, sessId, 'user', ts, `fail message ${i}`);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = {
      generate: jest.fn().mockResolvedValue({ response: 'bad json' }),
      embeddings: jest.fn(),
    };

    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 7,
      logger: silentLogger,
    });

    expect(result.status).toBe('partial');
    expect(result.items_failed).toBeGreaterThanOrEqual(3);

    const stateRows = memDb.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_backfill'`
    );
    expect(stateRows[0]?.values[0]?.[0]).toBe('quarantine');

    trailDb.close();
    memDb.close();
  }, 30000);
});
