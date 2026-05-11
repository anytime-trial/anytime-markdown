import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationFailedItemsRetry } from '../../src/pipeline/runConversationFailedItemsRetry';
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
  SQL: ReturnType<typeof initSqlJs> extends Promise<infer T> ? T : never,
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
  excerpt: string,
): void {
  const isUser = type === 'user';
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid, sessionId, type, timestamp, isUser ? null : excerpt, isUser ? excerpt : null]
  );
}

function insertFailedItem(
  memDb: Database,
  scope: string,
  itemKey: string,
  attemptCount: number,
  reason: string = 'extraction_failed',
): void {
  const failedAt = new Date().toISOString();
  memDb.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, '', ?)`,
    [scope, itemKey, failedAt, reason, attemptCount]
  );
}

function getFailedItem(memDb: Database, scope: string, itemKey: string): { attempt_count: number; reason: string } | null {
  const rows = memDb.exec(
    `SELECT attempt_count, reason FROM memory_failed_items WHERE scope = ? AND item_key = ?`,
    [scope, itemKey]
  );
  if (rows.length === 0 || (rows[0].values?.length ?? 0) === 0) return null;
  const row = rows[0].values[0];
  return { attempt_count: row[0] as number, reason: row[1] as string };
}

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

function makeValidOllama(responseObj?: object) {
  const response = JSON.stringify(
    responseObj ?? {
      summary: 'Retried extraction',
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

function makeFailingOllama(response: string = 'not json') {
  return {
    generate: jest.fn().mockResolvedValue({ response }),
    embeddings: jest.fn(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runConversationFailedItemsRetry', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── F1: successful retry → persist + delete failed_items row ──────────────
  test('F1: successful retry persists facts and deletes the failed_items row', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    // trail.db: 1 session with 1 user message
    insertSession(trailDb, 'sess_f1');
    insertMessage(trailDb, 'msg_f1', 'sess_f1', 'user', '2026-05-10T00:00:00.000Z', 'retry me');
    attachTrailDbFromHandle(memDb, trailDb);

    // failed_items: 1 row pointing at that episode
    insertFailedItem(memDb, 'conversation_backfill', 'sess_f1:msg_f1', 1);

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_retried).toBe(1);
    expect(result.items_recovered).toBe(1);
    expect(result.items_failed).toBe(0);

    // Row should be deleted from memory_failed_items
    expect(getFailedItem(memDb, 'conversation_backfill', 'sess_f1:msg_f1')).toBeNull();

    // Entity should be in memory_entities
    const ents = memDb.exec(`SELECT type, canonical_name FROM memory_entities WHERE type='Tool'`);
    expect(ents[0]?.values?.length ?? 0).toBeGreaterThan(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F2: extraction fails → attempt_count increments, row remains ──────────
  test('F2: extraction failure increments attempt_count and keeps the row', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertSession(trailDb, 'sess_f2');
    insertMessage(trailDb, 'msg_f2', 'sess_f2', 'user', '2026-05-10T00:00:00.000Z', 'retry-fail');
    attachTrailDbFromHandle(memDb, trailDb);

    insertFailedItem(memDb, 'conversation_backfill', 'sess_f2:msg_f2', 1);

    const ollama = makeFailingOllama('this is not json');
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success'); // run itself completes; per-item failure recorded
    expect(result.items_retried).toBe(1);
    expect(result.items_recovered).toBe(0);
    expect(result.items_failed).toBe(1);

    // Row still there, attempt_count incremented to 2
    const row = getFailedItem(memDb, 'conversation_backfill', 'sess_f2:msg_f2');
    expect(row).not.toBeNull();
    expect(row?.attempt_count).toBe(2);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F3: items at or above maxAttempts are skipped entirely ─────────────────
  test('F3: items with attempt_count >= maxAttempts are not retried', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    insertSession(trailDb, 'sess_f3');
    insertMessage(trailDb, 'msg_f3a', 'sess_f3', 'user', '2026-05-10T00:00:00.000Z', 'a');
    insertMessage(trailDb, 'msg_f3b', 'sess_f3', 'user', '2026-05-10T00:00:01.000Z', 'b');
    attachTrailDbFromHandle(memDb, trailDb);

    // 2 failed items: one at maxAttempts, one below
    insertFailedItem(memDb, 'conversation_backfill', 'sess_f3:msg_f3a', 3); // at cap
    insertFailedItem(memDb, 'conversation_backfill', 'sess_f3:msg_f3b', 1); // retriable

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      maxAttempts: 3,
      logger: silentLogger,
    });

    expect(result.items_retried).toBe(1); // only the retriable one
    expect(result.items_recovered).toBe(1);

    // Capped row remains unchanged
    const capped = getFailedItem(memDb, 'conversation_backfill', 'sess_f3:msg_f3a');
    expect(capped?.attempt_count).toBe(3);

    // Retriable row is gone (recovered)
    expect(getFailedItem(memDb, 'conversation_backfill', 'sess_f3:msg_f3b')).toBeNull();

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F4: episode missing from trail.db → recorded as episode_not_found ──────
  test('F4: missing trail.db episode is recorded as episode_not_found', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);
    // No session/message inserted — reconstruction will fail
    attachTrailDbFromHandle(memDb, trailDb);

    insertFailedItem(memDb, 'conversation_backfill', 'sess_missing:msg_missing', 1);

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.items_retried).toBe(1);
    expect(result.items_recovered).toBe(0);
    expect(result.items_failed).toBe(1);

    const row = getFailedItem(memDb, 'conversation_backfill', 'sess_missing:msg_missing');
    expect(row).not.toBeNull();
    expect(row?.reason).toBe('episode_not_found');
    expect(row?.attempt_count).toBe(2);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F5: 3 consecutive failures triggers quarantine ────────────────────────
  test('F5: 3 consecutive extraction failures trigger quarantine', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);

    for (let i = 1; i <= 4; i++) {
      const sessId = `sess_q${i}`;
      insertSession(trailDb, sessId);
      insertMessage(trailDb, `msg_q${i}`, sessId, 'user', `2026-05-10T00:00:0${i}.000Z`, `fail ${i}`);
      insertFailedItem(memDb, 'conversation_backfill', `${sessId}:msg_q${i}`, 1);
    }
    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeFailingOllama('not json');
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('partial');
    expect(result.items_failed).toBeGreaterThanOrEqual(3);

    // pipeline_state for the retry scope should be quarantine
    const stateRows = memDb.exec(
      `SELECT status FROM memory_pipeline_state WHERE scope = 'conversation_failed_items_retry'`
    );
    expect(stateRows[0]?.values[0]?.[0]).toBe('quarantine');

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F6: empty failed_items → success with zero counts ─────────────────────
  test('F6: empty failed_items returns success with zero counts', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb(SQL);
    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_retried).toBe(0);
    expect(result.items_recovered).toBe(0);
    expect(result.items_failed).toBe(0);

    // generate should not have been called
    expect(ollama.generate).not.toHaveBeenCalled();

    trailDb.close();
    memDb.close();
  }, 30000);
});
