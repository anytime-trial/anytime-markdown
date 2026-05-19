/**
 * E2E: MemoryDbSession の scope メソッドが run*Incremental を忠実にラップし、
 * 実 memory-core DB に正しい出力を生成することを検証する (LEP Step 3b 出力一致)。
 *
 * conversation scope を対象に、first-run backfill 経路 → incremental 経路 (cursor 前進)
 * を通す。LLM 非依存 scope (drift) も空 DB で no-op 完走することを確認する。
 */

import { createOllamaClient } from '@anytime-markdown/agent-core';

import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import type { MemoryCoreDb } from '../../src/db/connection';
import type { MemoryLogger } from '../../src/logger';
import { MemoryDbSession } from '../../src/service/MemoryDbSession';
import { startMockOllama, type MockOllamaServer } from './mockOllama';

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

function makeTrailDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL DEFAULT '', repo_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'claude_code'
      CHECK (source IN ('claude_code','codex','gemini','cursor','other'))
  ) STRICT`);
  db.run(`CREATE TABLE messages (
    uuid TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL, timestamp TEXT, text_content TEXT, user_content TEXT
  ) STRICT`);
  return db;
}

function insertPair(db: BetterSqlite3MemoryDb, sid: string, ts: string, userText: string): void {
  db.run(`INSERT INTO sessions (id) VALUES (?)`, [sid]);
  db.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content) VALUES (?,?,?,?,?,?)`,
    [`${sid}-u`, sid, 'user', ts, null, userText],
  );
  db.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, user_content) VALUES (?,?,?,?,?,?)`,
    [`${sid}-a`, sid, 'assistant', ts.replace('00.000', '30.000'), 'ok', null],
  );
}

async function makeMemoryDb(): Promise<MemoryCoreDb> {
  const rawDb = BetterSqlite3MemoryDb.openInMemory();
  rawDb.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);
  return { db: rawDb, save: () => {}, close: () => rawDb.close() };
}

describe('E2E: MemoryDbSession scope methods', () => {
  let mock: MockOllamaServer;
  beforeAll(async () => {
    mock = await startMockOllama();
  });
  afterAll(async () => {
    await mock.close();
  });

  test('runConversation: first-run backfill creates edge, second run advances cursor with no-op', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    // 直近の timestamp (backfill window 内)。backfillDays を大きくして date 依存を排除。
    const now = new Date();
    const ts = new Date(now.getTime() - 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    insertPair(trailDb, 'sess-1', ts, 'I prefer TypeScript');
    attachTrailDbFromHandle(memDb.db, trailDb);

    mock.setResponses([
      {
        generate: JSON.stringify({
          summary: 'User prefers TypeScript',
          entities: [
            { type: 'Person', name: 'user', aliases: [], tags: [], attributes: {} },
            { type: 'Library', name: 'TypeScript', aliases: [], tags: [], attributes: {} },
          ],
          relations: [
            { subject: { type: 'Person', name: 'user' }, predicate: 'prefers', object: { type: 'Library', name: 'TypeScript' } },
          ],
          questions: [],
        }),
      },
    ]);

    const ollama = createOllamaClient({ baseUrl: mock.baseUrl });
    const session = new MemoryDbSession({
      memDb,
      ollama,
      logger: silentLogger,
      gitRoot: '/tmp/repo',
      backfillDays: 36500,
    });

    const r1 = await session.runConversation();
    expect(r1.status).toBe('success');
    expect(r1.scope).toBe('conversation_incremental');

    const edges = memDb.db.exec(`SELECT predicate FROM memory_edges WHERE valid_to IS NULL`);
    expect(edges[0]?.values?.some((row) => row[0] === 'prefers')).toBe(true);

    const state1 = memDb.db.exec(
      `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`,
    );
    const lastAt1 = state1[0].values[0][0] as string;
    expect(lastAt1 > '1970-01-01T00:00:00.000Z').toBe(true);

    // second run: cursor set → incremental 経路で no-op
    mock.setResponses([{ generate: JSON.stringify({ summary: 'x', entities: [], relations: [], questions: [] }) }]);
    const r2 = await session.runConversation();
    expect(r2.status).toBe('success');
    expect(r2.itemsProcessed).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  test('runDrift: empty DB completes without error (LLM-free, pure SQL)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(memDb.db, trailDb);
    const session = new MemoryDbSession({
      memDb,
      ollama: createOllamaClient({ baseUrl: mock.baseUrl }),
      logger: silentLogger,
      gitRoot: '/tmp/repo',
    });
    const r = await session.runDrift();
    expect(r.scope).toBe('drift_detection');
    expect(r.status).not.toBe('error');
    trailDb.close();
    memDb.close();
  }, 30000);
});
