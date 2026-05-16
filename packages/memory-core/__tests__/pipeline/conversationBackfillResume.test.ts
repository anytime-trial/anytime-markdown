import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationBackfill } from '../../src/pipeline/runConversationBackfill';
import { episodeId } from '../../src/ingest/conversation/persist';
import type { MemoryLogger } from '../../src/logger';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

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
     ) STRICT`,
  );
  return trailDb;
}

function insertSession(trailDb: BetterSqlite3MemoryDb, id: string): void {
  trailDb.run(`INSERT INTO sessions VALUES (?)`, [id]);
}

function insertUserMessage(
  trailDb: BetterSqlite3MemoryDb,
  uuid: string,
  sessionId: string,
  timestamp: string,
  excerpt: string,
): void {
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
     VALUES (?, ?, 'user', ?, NULL, ?)`,
    [uuid, sessionId, timestamp, excerpt],
  );
}

function preInsertEpisode(
  memDb: BetterSqlite3MemoryDb,
  sessionId: string,
  msgUuid: string,
  validFrom: string,
): void {
  const id = episodeId(sessionId, msgUuid);
  memDb.run(
    `INSERT INTO memory_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt)
     VALUES (?, ?, ?, ?, 'claude_code', 'unknown', ?, ?, '')`,
    [id, sessionId, msgUuid, msgUuid, validFrom, validFrom],
  );
}

function makeValidOllama() {
  const response = JSON.stringify({
    summary: 'resume test',
    entities: [{ type: 'Tool', name: 'jest', aliases: [], tags: [], attributes: {} }],
    relations: [],
    questions: [],
  });
  return {
    generate: jest.fn().mockResolvedValue({ response }),
    embeddings: jest.fn(),
  };
}

describe('runConversationBackfill resume', () => {
  const ts3DaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const ts2DaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const ts1DayAgo = new Date(Date.now() - 1 * 86_400_000).toISOString();

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── R1: all-skip path ────────────────────────────────────────────────────
  test('R1: 5 already-persisted episodes are all skipped, Ollama is not called', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    for (let i = 0; i < 5; i++) {
      const sessId = `sess_skip_${i}`;
      const msgUuid = `msg_skip_${i}`;
      const ts = new Date(Date.now() - (2 * 86_400_000) + i * 1000).toISOString();
      insertSession(trailDb, sessId);
      insertUserMessage(trailDb, msgUuid, sessId, ts, `skip message ${i}`);
      preInsertEpisode(memDb, sessId, msgUuid, ts);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 5,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(0);
    expect(result.items_skipped).toBe(5);
    expect(ollama.generate).not.toHaveBeenCalled();

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── R2: mixed skip + process ─────────────────────────────────────────────
  test('R2: 5 already-persisted + 4 new episodes → 4 processed, 5 skipped, 4 Ollama calls', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    // 5 already-persisted episodes
    for (let i = 0; i < 5; i++) {
      const sessId = `sess_done_${i}`;
      const msgUuid = `msg_done_${i}`;
      const ts = new Date(Date.now() - 3 * 86_400_000 + i * 1000).toISOString();
      insertSession(trailDb, sessId);
      insertUserMessage(trailDb, msgUuid, sessId, ts, `done message ${i}`);
      preInsertEpisode(memDb, sessId, msgUuid, ts);
    }

    // 4 new episodes (no memory_episodes row yet)
    for (let i = 0; i < 4; i++) {
      const sessId = `sess_new_${i}`;
      const msgUuid = `msg_new_${i}`;
      const ts = new Date(Date.now() - 2 * 86_400_000 + i * 1000).toISOString();
      insertSession(trailDb, sessId);
      insertUserMessage(trailDb, msgUuid, sessId, ts, `new message ${i}`);
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 5,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(4);
    expect(result.items_skipped).toBe(5);
    expect(ollama.generate).toHaveBeenCalledTimes(4);

    trailDb.close();
    memDb.close();
  }, 30000);

  // ── R3: maxTimestamp progresses even when all skipped ────────────────────
  test('R3: skip-only run still advances conversation_incremental.last_processed_at', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    insertSession(trailDb, 'sess_a');
    insertUserMessage(trailDb, 'msg_a', 'sess_a', ts3DaysAgo, 'a');
    preInsertEpisode(memDb, 'sess_a', 'msg_a', ts3DaysAgo);

    insertSession(trailDb, 'sess_b');
    insertUserMessage(trailDb, 'msg_b', 'sess_b', ts2DaysAgo, 'b');
    preInsertEpisode(memDb, 'sess_b', 'msg_b', ts2DaysAgo);

    insertSession(trailDb, 'sess_c');
    insertUserMessage(trailDb, 'msg_c', 'sess_c', ts1DayAgo, 'c');
    preInsertEpisode(memDb, 'sess_c', 'msg_c', ts1DayAgo);

    attachTrailDbFromHandle(memDb, trailDb);

    const ollama = makeValidOllama();
    const result = await runConversationBackfill({
      db: memDb,
      ollama,
      sinceDays: 5,
      logger: silentLogger,
    });

    expect(result.status).toBe('success');
    expect(result.items_skipped).toBe(3);
    expect(result.items_processed).toBe(0);

    const stateRows = memDb.exec(
      `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`,
    );
    expect(stateRows[0]?.values).toHaveLength(1);
    const lastProcessedAt = stateRows[0].values[0][0] as string;
    // Should be > ts1DayAgo (newest valid_from + 1ms)
    expect(lastProcessedAt > ts1DayAgo).toBe(true);

    trailDb.close();
    memDb.close();
  }, 30000);
});
