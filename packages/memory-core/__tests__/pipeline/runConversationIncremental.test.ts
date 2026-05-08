import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationIncremental } from '../../src/pipeline/runConversationIncremental';
import type { MemoryLogger } from '../../src/logger';

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeMemoryDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(SQL: ReturnType<typeof initSqlJs> extends Promise<infer T> ? T : never): Database {
  const trailDb = new SQL.Database();
  trailDb.run(`CREATE TABLE sessions (id TEXT PRIMARY KEY) STRICT`);
  trailDb.run(
    `CREATE TABLE messages (
       uuid TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       type TEXT NOT NULL,
       timestamp TEXT NOT NULL,
       message_excerpt TEXT
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
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, message_excerpt)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, sessionId, type, timestamp, excerpt]
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
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── I1: basic happy path ─────────────────────────────────────────────────
  test('I1: 1 session, 2 messages → entities_inserted ≥ 1, pipeline_state updated', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

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
    const trailDb = makeTrailDb(SQL);

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
    const trailDb = makeTrailDb(SQL);

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
    const trailDb = makeTrailDb(SQL);

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
});
