// 公開 getter (getAllAssistantMessages / getSessionCosts) のカバレッジ補完。
// いずれも in-memory DB に直接 seed して検証する純粋 DB query。

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };
function inner(db: TrailDatabase): SqlJsDb {
  return (db as unknown as { db: SqlJsDb }).db;
}

function insertSession(db: TrailDatabase, id: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, repo_name, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
    [id, id],
  );
}

function insertAssistantMessage(
  db: TrailDatabase, uuid: string, sessionId: string, toolCalls: string | null, outputTokens: number,
): void {
  insertSession(db, sessionId);
  inner(db).run(
    `INSERT OR IGNORE INTO messages (uuid, session_id, type, tool_calls, output_tokens, timestamp)
     VALUES (?, ?, 'assistant', ?, ?, '2026-05-20T10:00:00.000Z')`,
    [uuid, sessionId, toolCalls, outputTokens],
  );
}

function insertSessionCost(
  db: TrailDatabase, sessionId: string, model: string,
  input: number, output: number, cacheRead: number, cacheCreation: number, cost: number,
): void {
  insertSession(db, sessionId);
  inner(db).run(
    `INSERT OR REPLACE INTO session_costs (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, model, input, output, cacheRead, cacheCreation, cost],
  );
}

describe('TrailDatabase.getAllAssistantMessages', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('returns [] when there are no assistant messages', () => {
    expect(db.getAllAssistantMessages()).toEqual([]);
  });

  it('returns only assistant messages whose tool_calls is not null', () => {
    insertAssistantMessage(db, 'm1', 's1', '[{"name":"Read"}]', 42);
    // tool_calls NULL → excluded by the WHERE clause
    insertAssistantMessage(db, 'm2', 's1', null, 5);

    const rows = db.getAllAssistantMessages();
    expect(rows).toHaveLength(1);
    expect(rows[0].tool_calls).toBe('[{"name":"Read"}]');
    expect(rows[0].output_tokens).toBe(42);
  });
});

describe('TrailDatabase.getSessionCosts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('returns [] for an unknown session', () => {
    expect(db.getSessionCosts('missing')).toEqual([]);
  });

  it('returns per-model cost rows for the session', () => {
    insertSessionCost(db, 's1', 'claude-opus', 100, 50, 10, 5, 1.23);
    insertSessionCost(db, 's1', 'claude-haiku', 20, 8, 0, 0, 0.04);
    insertSessionCost(db, 's2', 'claude-opus', 999, 999, 0, 0, 9.99);

    const rows = db.getSessionCosts('s1');
    expect(rows).toHaveLength(2);
    const opus = rows.find((r) => r.model === 'claude-opus');
    expect(opus?.input_tokens).toBe(100);
    expect(opus?.output_tokens).toBe(50);
    expect(opus?.cache_read_tokens).toBe(10);
    expect(opus?.estimated_cost_usd).toBeCloseTo(1.23, 2);
  });
});
