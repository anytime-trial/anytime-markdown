import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { detectBackfillWindowExpansion } from '../../src/pipeline/detectBackfillWindowExpansion';

const DAY = 86_400_000;

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

function insertTrailUserMessage(
  trailDb: BetterSqlite3MemoryDb,
  uuid: string,
  sessionId: string,
  timestamp: string,
): void {
  trailDb.run(
    `INSERT OR IGNORE INTO sessions VALUES (?)`,
    [sessionId],
  );
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
     VALUES (?, ?, 'user', ?, NULL, ?)`,
    [uuid, sessionId, timestamp, `body ${uuid}`],
  );
}

function preInsertEpisode(
  memDb: BetterSqlite3MemoryDb,
  sessionId: string,
  msgUuid: string,
  validFrom: string,
): void {
  // 簡単な決定論的 ID。実装と同じ episodeId 関数は使わずに済むよう uuid を流用。
  const id = `${sessionId}:${msgUuid}`;
  memDb.run(
    `INSERT INTO memory_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt)
     VALUES (?, ?, ?, ?, 'claude_code', 'unknown', ?, ?, '')`,
    [id, sessionId, msgUuid, msgUuid, validFrom, validFrom],
  );
}

describe('detectBackfillWindowExpansion', () => {
  test('no persisted episodes (first run) → shouldExpand=false', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertTrailUserMessage(trailDb, 'm1', 's1', new Date(Date.now() - 5 * DAY).toISOString());
    attachTrailDbFromHandle(memDb, trailDb);

    const result = detectBackfillWindowExpansion({ db: memDb, sinceDays: 30 });
    expect(result.shouldExpand).toBe(false);
    expect(result.reason).toMatch(/no persisted episodes/);
  });

  test('desired_start >= earliest persisted → shouldExpand=false (window shrunk or equal)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    // 永続化済み: 30 日前から
    const ts30d = new Date(Date.now() - 30 * DAY).toISOString();
    insertTrailUserMessage(trailDb, 'm1', 's1', ts30d);
    preInsertEpisode(memDb, 's1', 'm1', ts30d);
    attachTrailDbFromHandle(memDb, trailDb);

    // 7 日に縮小 → desired_start = 7 日前 > earliest 30 日前
    const result = detectBackfillWindowExpansion({ db: memDb, sinceDays: 7 });
    expect(result.shouldExpand).toBe(false);
  });

  test('desired_start < earliest but no unprocessed messages in gap → shouldExpand=false', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    // 永続化済み: 10 日前のみ。trail.db にも 10 日前のメッセージしかない
    // (ユーザーは 10 日前に install したばかり)。
    const ts10d = new Date(Date.now() - 10 * DAY).toISOString();
    insertTrailUserMessage(trailDb, 'm1', 's1', ts10d);
    preInsertEpisode(memDb, 's1', 'm1', ts10d);
    attachTrailDbFromHandle(memDb, trailDb);

    // 60 日に拡張するが、trail には拡張区間のデータがない
    const result = detectBackfillWindowExpansion({ db: memDb, sinceDays: 60 });
    expect(result.shouldExpand).toBe(false);
    expect(result.reason).toMatch(/no unprocessed/);
  });

  test('desired_start < earliest AND unprocessed messages exist → shouldExpand=true', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    // 永続化済みは 10 日前から。trail.db には 40 日前にも data あり。
    const ts40d = new Date(Date.now() - 40 * DAY).toISOString();
    const ts10d = new Date(Date.now() - 10 * DAY).toISOString();
    insertTrailUserMessage(trailDb, 'old1', 's-old', ts40d);
    insertTrailUserMessage(trailDb, 'old2', 's-old', new Date(Date.now() - 35 * DAY).toISOString());
    insertTrailUserMessage(trailDb, 'new1', 's-new', ts10d);
    preInsertEpisode(memDb, 's-new', 'new1', ts10d);
    attachTrailDbFromHandle(memDb, trailDb);

    // 60 日に拡張 → 40 / 35 日前の 2 件が未処理として検出されるはず
    const result = detectBackfillWindowExpansion({ db: memDb, sinceDays: 60 });
    expect(result.shouldExpand).toBe(true);
    expect(result.reason).toMatch(/2 user messages/);
  });

  test('desired_start equal to earliest persisted → shouldExpand=false (no widening)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    const ts30d = new Date(Date.now() - 30 * DAY).toISOString();
    insertTrailUserMessage(trailDb, 'm1', 's1', ts30d);
    preInsertEpisode(memDb, 's1', 'm1', ts30d);
    attachTrailDbFromHandle(memDb, trailDb);

    // 30 日のまま (= earliest)
    const result = detectBackfillWindowExpansion({ db: memDb, sinceDays: 30 });
    expect(result.shouldExpand).toBe(false);
  });
});
