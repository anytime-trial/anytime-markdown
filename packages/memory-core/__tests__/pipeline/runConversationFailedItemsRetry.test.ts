import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationFailedItemsRetry } from '../../src/pipeline/runConversationFailedItemsRetry';
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
  memDb: BetterSqlite3MemoryDb,
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

function getFailedItem(memDb: BetterSqlite3MemoryDb, scope: string, itemKey: string): { attempt_count: number; reason: string } | null {
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── F1: successful retry → persist + delete failed_items row ──────────────
  test('F1: successful retry persists facts and deletes the failed_items row', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

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
    const trailDb = makeTrailDb();

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
    const trailDb = makeTrailDb();

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
    const trailDb = makeTrailDb();
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
    const trailDb = makeTrailDb();

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
    const trailDb = makeTrailDb();
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

  // ── F7: MEMORY_CORE_FAILED_RETRY_MAX env-var path ─────────────────────────
  test('F7: MEMORY_CORE_FAILED_RETRY_MAX env-var sets maxAttempts', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess_env');
    insertMessage(trailDb, 'msg_env', 'sess_env', 'user', '2026-05-10T00:00:00.000Z', 'env test');
    attachTrailDbFromHandle(memDb, trailDb);

    // item at attempt 2 — would be skipped with default maxAttempts=3 if we set max=2
    insertFailedItem(memDb, 'conversation_backfill', 'sess_env:msg_env', 2);

    const ollama = makeValidOllama();
    const prevMax = process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
    process.env['MEMORY_CORE_FAILED_RETRY_MAX'] = '2';
    try {
      // env-var maxAttempts=2, item is at attempt_count=2 → at cap → skipped
      const result = await runConversationFailedItemsRetry({
        db: memDb,
        ollama,
        logger: silentLogger,
        // do NOT pass maxAttempts explicitly so env-var is used
      });
      // item capped → not retried → items_retried=0
      expect(result.items_retried).toBe(0);
    } finally {
      if (prevMax === undefined) {
        delete process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
      } else {
        process.env['MEMORY_CORE_FAILED_RETRY_MAX'] = prevMax;
      }
    }

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F8: MEMORY_CORE_FAILED_RETRY_MAX invalid value falls back to default ──
  test('F8: invalid MEMORY_CORE_FAILED_RETRY_MAX falls back to DEFAULT_MAX_ATTEMPTS=3', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess_inv');
    insertMessage(trailDb, 'msg_inv', 'sess_inv', 'user', '2026-05-10T00:00:00.000Z', 'inv test');
    attachTrailDbFromHandle(memDb, trailDb);

    // item at attempt 1 — should be retried with default=3
    insertFailedItem(memDb, 'conversation_backfill', 'sess_inv:msg_inv', 1);

    const ollama = makeValidOllama();
    const prevMax = process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
    process.env['MEMORY_CORE_FAILED_RETRY_MAX'] = 'not-a-number';
    try {
      const result = await runConversationFailedItemsRetry({
        db: memDb,
        ollama,
        logger: silentLogger,
      });
      // Default maxAttempts=3, item at attempt 1 < 3 → retried
      expect(result.items_retried).toBe(1);
      expect(result.items_recovered).toBe(1);
    } finally {
      if (prevMax === undefined) {
        delete process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
      } else {
        process.env['MEMORY_CORE_FAILED_RETRY_MAX'] = prevMax;
      }
    }

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F9: MEMORY_CORE_EXTRACT_CONCURRENCY env-var ────────────────────────────
  test('F9: MEMORY_CORE_EXTRACT_CONCURRENCY env-var is parsed (valid number)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // 4 items — with concurrency=4 all processed in 1 batch
    for (let i = 0; i < 4; i++) {
      insertSession(trailDb, `sess_conc_${i}`);
      insertMessage(trailDb, `msg_conc_${i}`, `sess_conc_${i}`, 'user', `2026-05-10T00:00:0${i}.000Z`, `conc ${i}`);
      insertFailedItem(memDb, 'conversation_backfill', `sess_conc_${i}:msg_conc_${i}`, 1);
    }
    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const prevConc = process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
    process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'] = '4';
    try {
      const result = await runConversationFailedItemsRetry({
        db: memDb,
        ollama,
        logger: silentLogger,
      });
      expect(result.items_retried).toBe(4);
      expect(result.items_recovered).toBe(4);
    } finally {
      if (prevConc === undefined) {
        delete process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
      } else {
        process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'] = prevConc;
      }
    }

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F10: save() callback fires at progress checkpoint ─────────────────────
  test('F10: save() callback fires every PROGRESS_LOG_INTERVAL (5) items', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // 6 items → PROGRESS_LOG_INTERVAL=5 fires once mid-run
    for (let i = 0; i < 6; i++) {
      insertSession(trailDb, `sess_save_${i}`);
      insertMessage(trailDb, `msg_save_${i}`, `sess_save_${i}`, 'user', `2026-05-10T00:0${i}:00.000Z`, `save ${i}`);
      insertFailedItem(memDb, 'conversation_backfill', `sess_save_${i}:msg_save_${i}`, 1);
    }
    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    let saveCallCount = 0;
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
      save: () => { saveCallCount++; },
    });

    expect(result.items_retried).toBe(6);
    // save() fires at position 5 (the 5th item)
    expect(saveCallCount).toBeGreaterThanOrEqual(1);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F12: conversation_incremental scope items are retried (regression) ─────
  // Regression: retry previously defaulted to scope='conversation_backfill' only,
  // so conversation_incremental extraction_failed items were never reprocessed
  // and accumulated in memory_failed_items forever.
  test('F12: conversation_incremental scope items are picked up and recovered', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess_inc');
    insertMessage(trailDb, 'msg_inc', 'sess_inc', 'user', '2026-05-10T00:00:00.000Z', 'incremental retry me');
    attachTrailDbFromHandle(memDb, trailDb);

    // scope = conversation_incremental (NOT backfill)
    insertFailedItem(memDb, 'conversation_incremental', 'sess_inc:msg_inc', 1);

    const ollama = makeValidOllama();
    // no sourceScope passed → default must cover conversation_incremental
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.items_retried).toBe(1);
    expect(result.items_recovered).toBe(1);
    expect(getFailedItem(memDb, 'conversation_incremental', 'sess_inc:msg_inc')).toBeNull();

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F13: both incremental and backfill scopes retried in one run ──────────
  test('F13: both conversation_incremental and conversation_backfill items are retried together', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess_both_i');
    insertMessage(trailDb, 'msg_both_i', 'sess_both_i', 'user', '2026-05-10T00:00:00.000Z', 'inc');
    insertSession(trailDb, 'sess_both_b');
    insertMessage(trailDb, 'msg_both_b', 'sess_both_b', 'user', '2026-05-10T00:00:01.000Z', 'back');
    attachTrailDbFromHandle(memDb, trailDb);

    insertFailedItem(memDb, 'conversation_incremental', 'sess_both_i:msg_both_i', 1);
    insertFailedItem(memDb, 'conversation_backfill', 'sess_both_b:msg_both_b', 1);

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    expect(result.items_retried).toBe(2);
    expect(result.items_recovered).toBe(2);
    expect(getFailedItem(memDb, 'conversation_incremental', 'sess_both_i:msg_both_i')).toBeNull();
    expect(getFailedItem(memDb, 'conversation_backfill', 'sess_both_b:msg_both_b')).toBeNull();

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F14: empty sourceScopes is guarded (no invalid `scope IN ()` SQL) ─────
  test('F14: empty sourceScopes returns success with zero counts (no SQL error)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'sess_empty');
    insertMessage(trailDb, 'msg_empty', 'sess_empty', 'user', '2026-05-10T00:00:00.000Z', 'x');
    insertFailedItem(memDb, 'conversation_incremental', 'sess_empty:msg_empty', 1);
    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
      sourceScopes: [],
    });

    expect(result.status).toBe('success');
    expect(result.items_retried).toBe(0);
    expect(ollama.generate).not.toHaveBeenCalled();

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── F11: malformed item_key (no colon) → episode_not_found ────────────────
  test('F11: malformed item_key with no colon → treated as episode_not_found', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(memDb, trailDb);

    // Insert a failed item with malformed key (no colon separator)
    memDb.run(
      `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
       VALUES ('conversation_backfill', 'malformed-no-colon-key', ?, 'extraction_failed', '', 1)`,
      [new Date().toISOString()],
    );

    const ollama = makeValidOllama();
    const result = await runConversationFailedItemsRetry({
      db: memDb,
      ollama,
      logger: silentLogger,
    });

    // Malformed key → no episode reconstructed → items_failed=1
    expect(result.items_retried).toBe(1);
    expect(result.items_recovered).toBe(0);
    expect(result.items_failed).toBe(1);

    trailDb.close();
    memDb.close();
  }, 30000);
});
