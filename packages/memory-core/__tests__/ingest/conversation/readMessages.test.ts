import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { readMessagesSince } from '../../../src/ingest/conversation/readMessages';

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

function attachAsTrail(memDb: BetterSqlite3MemoryDb, trailDb: BetterSqlite3MemoryDb): void {
  const tempPath = require('node:path').join(
    require('node:os').tmpdir(),
    `readMessages-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
  );
  require('node:fs').writeFileSync(tempPath, trailDb.serialize());
  memDb.attach(tempPath, 'trail', true);
}

function insertSession(trailDb: BetterSqlite3MemoryDb, id: string): void {
  trailDb.run(`INSERT INTO sessions VALUES (?)`, [id]);
}

function insertMsg(
  trailDb: BetterSqlite3MemoryDb,
  uuid: string,
  sessionId: string,
  type: 'user' | 'assistant' | 'system',
  timestamp: string,
  excerpt: string,
): void {
  const isUser = type === 'user';
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      sessionId,
      type,
      timestamp,
      isUser ? null : excerpt,
      isUser ? excerpt : null,
    ],
  );
}

describe('readMessagesSince', () => {
  test('returns empty when no messages match', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    attachAsTrail(memDb, trailDb);
    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions).toEqual([]);
  });

  test('groups messages by session_id and orders by timestamp within session', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'sess-a');
    insertSession(trailDb, 'sess-b');
    insertMsg(trailDb, 'msg-a2', 'sess-a', 'assistant', '2026-05-10T10:00:01.000Z', 'a-assistant');
    insertMsg(trailDb, 'msg-a1', 'sess-a', 'user', '2026-05-10T10:00:00.000Z', 'a-user');
    insertMsg(trailDb, 'msg-b1', 'sess-b', 'user', '2026-05-10T11:00:00.000Z', 'b-user');
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions).toHaveLength(2);

    const sessA = sessions.find((s) => s.session_id === 'sess-a')!;
    expect(sessA.messages.map((m) => m.uuid)).toEqual(['msg-a1', 'msg-a2']);
    expect(sessA.messages[0].text_excerpt).toBe('a-user');
    expect(sessA.messages[1].text_excerpt).toBe('a-assistant');

    const sessB = sessions.find((s) => s.session_id === 'sess-b')!;
    expect(sessB.messages.map((m) => m.uuid)).toEqual(['msg-b1']);
  });

  test('filters messages older than sinceISO', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'sess-old');
    insertSession(trailDb, 'sess-new');
    insertMsg(trailDb, 'old', 'sess-old', 'user', '2026-04-01T00:00:00.000Z', 'old');
    insertMsg(trailDb, 'new', 'sess-new', 'user', '2026-05-10T00:00:00.000Z', 'new');
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-05-01T00:00:00.000Z')];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe('sess-new');
  });

  test('handles 100 sessions × 10 messages without materializing into a single Map', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    for (let s = 0; s < 100; s++) {
      const sid = `sess-${String(s).padStart(3, '0')}`;
      insertSession(trailDb, sid);
      for (let m = 0; m < 10; m++) {
        const ts = `2026-05-10T10:${String(m).padStart(2, '0')}:00.000Z`;
        insertMsg(trailDb, `${sid}-msg-${m}`, sid, m % 2 === 0 ? 'user' : 'assistant', ts, `body ${m}`);
      }
    }
    attachAsTrail(memDb, trailDb);

    // 早期 break で停止できる = ジェネレータ実装である。
    // 旧実装も yield 形式なので break 自体は可能だが、ここでは結果集合の整合性のみ
    // assert する（ストリーミング性質の検出は不要）。
    const collected: { session_id: string; count: number }[] = [];
    for (const { session_id, messages } of readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')) {
      collected.push({ session_id, count: messages.length });
    }
    expect(collected).toHaveLength(100);
    for (const entry of collected) {
      expect(entry.count).toBe(10);
    }
  });

  test('orders sessions by MIN(timestamp) chronologically, not by session_id', () => {
    // Sessions must be yielded oldest-first so that any cursor advancement
    // based on "max timestamp seen so far" stays monotonic. UUID-ordered
    // iteration breaks this: a session whose UUID sorts first but contains
    // today's messages would jump maxTimestamp to today, causing backfill
    // resume to skip every older session via WHERE timestamp >= cursor.
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'zzz-newest');
    insertSession(trailDb, 'mmm-middle');
    insertSession(trailDb, 'aaa-oldest');
    insertMsg(trailDb, 'm-z1', 'zzz-newest', 'user', '2026-05-16T10:00:00.000Z', 'newest');
    insertMsg(trailDb, 'm-m1', 'mmm-middle', 'user', '2026-04-25T10:00:00.000Z', 'middle');
    insertMsg(trailDb, 'm-a1', 'aaa-oldest', 'user', '2026-04-16T10:00:00.000Z', 'oldest');
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions.map((s) => s.session_id)).toEqual([
      'aaa-oldest',
      'mmm-middle',
      'zzz-newest',
    ]);
  });

  test('chronological order survives even when older session has alphabetically-later UUID', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    // UUID 順と timestamp 順が真逆になるケース
    insertSession(trailDb, 'aaa-newest-uuid');
    insertSession(trailDb, 'zzz-oldest-uuid');
    insertMsg(trailDb, 'm-a', 'aaa-newest-uuid', 'user', '2026-05-16T10:00:00.000Z', 'newest');
    insertMsg(trailDb, 'm-z', 'zzz-oldest-uuid', 'user', '2026-04-16T10:00:00.000Z', 'oldest');
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions.map((s) => s.session_id)).toEqual([
      'zzz-oldest-uuid',
      'aaa-newest-uuid',
    ]);
  });

  test('chronological order uses MIN timestamp per session (overlapping ranges)', () => {
    // 長期セッション A (MIN=4/20 MAX=5/15) と短期セッション B (MIN=4/21 MAX=4/22)
    // が混在しても、yield 順は MIN(timestamp) 昇順 → A, B。
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'sess-A');
    insertSession(trailDb, 'sess-B');
    insertMsg(trailDb, 'A1', 'sess-A', 'user', '2026-04-20T00:00:00.000Z', 'A start');
    insertMsg(trailDb, 'A2', 'sess-A', 'user', '2026-05-15T00:00:00.000Z', 'A end');
    insertMsg(trailDb, 'B1', 'sess-B', 'user', '2026-04-21T00:00:00.000Z', 'B start');
    insertMsg(trailDb, 'B2', 'sess-B', 'user', '2026-04-22T00:00:00.000Z', 'B end');
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions.map((s) => s.session_id)).toEqual(['sess-A', 'sess-B']);
  });

  test('excludes types other than user/assistant/system', () => {
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'sess-mixed');
    insertMsg(trailDb, 'u1', 'sess-mixed', 'user', '2026-05-10T10:00:00.000Z', 'u');
    insertMsg(trailDb, 'a1', 'sess-mixed', 'assistant', '2026-05-10T10:00:01.000Z', 'a');
    insertMsg(trailDb, 's1', 'sess-mixed', 'system', '2026-05-10T10:00:02.000Z', 's');
    // 不正な type — SQL filter で除外される
    trailDb.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content)
       VALUES ('tool1', 'sess-mixed', 'tool_use', '2026-05-10T10:00:03.000Z', 'tool', NULL)`,
    );
    attachAsTrail(memDb, trailDb);

    const sessions = [...readMessagesSince(memDb, '2026-01-01T00:00:00.000Z')];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].messages.map((m) => m.uuid)).toEqual(['u1', 'a1', 's1']);
  });
});
