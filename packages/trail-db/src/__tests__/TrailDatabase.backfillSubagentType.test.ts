
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const insertSession = (db: TrailDatabase, sessionId: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '2026-04-29T00:00:00.000Z', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
};

const insertMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  fields: { agentId?: string; toolCalls?: string } = {},
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, parent_uuid, type, timestamp, agent_id, tool_calls
     ) VALUES (?, ?, NULL, 'assistant', '2026-04-29T00:00:00.000Z', ?, ?)`,
    [uuid, sessionId, fields.agentId ?? null, fields.toolCalls ?? null],
  );
};

const readSubagentType = (db: TrailDatabase, uuid: string): string | null => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  const result = inner.exec('SELECT subagent_type FROM messages WHERE uuid = ?', [uuid]);
  const v = result[0]?.values[0]?.[0];
  return (v as string | null) ?? null;
};

describe('TrailDatabase.backfillSubagentType', () => {
  let db: TrailDatabase;
  let tmpProjectsDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    // createTestTrailDatabase は createTables() を呼び、その末尾で init-time backfillSubagentType() が
    // 走って _migrations.subagent_type_backfill_v1 が記録される。テスト内で同関数を再実行できるよう、
    // 該当フラグを毎テスト削除する。
    const inner = (db as unknown as { db: SqlJsDb }).db;
    inner.run("DELETE FROM _migrations WHERE key = 'subagent_type_backfill_v1'");
    tmpProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-backfill-test-'));
  });

  afterEach(() => {
    db.close();
    try { fs.rmSync(tmpProjectsDir, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
  });

  it('backfills subagent_type from meta.json keyed by agent_id', () => {
    const sessionId = 'sess-meta-1';
    insertSession(db, sessionId);
    insertMessage(db, 'msg-sub-1', sessionId, { agentId: 'a-meta-1' });
    insertMessage(db, 'msg-sub-2', sessionId, { agentId: 'a-meta-2' });

    const subagentDir = path.join(tmpProjectsDir, 'project-x', sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-meta-1.meta.json'),
      JSON.stringify({ agentType: 'Explore', description: 'find' }),
    );
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-meta-2.meta.json'),
      JSON.stringify({ agentType: 'code-reviewer', description: 'review' }),
    );

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);

    expect(readSubagentType(db, 'msg-sub-1')).toBe('Explore');
    expect(readSubagentType(db, 'msg-sub-2')).toBe('code-reviewer');
  });

  it('backfills parent assistant message subagent_type from tool_calls JSON', () => {
    const sessionId = 'sess-parent-1';
    insertSession(db, sessionId);
    const toolCalls = JSON.stringify([
      {
        id: 'toolu_X',
        name: 'Agent',
        input: { description: 'd', subagent_type: 'Plan', model: 'opus', prompt: 'p' },
      },
    ]);
    insertMessage(db, 'msg-parent-1', sessionId, { toolCalls });

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);

    expect(readSubagentType(db, 'msg-parent-1')).toBe('Plan');
  });

  it('is idempotent: repeated runs do not change already-set values', () => {
    const sessionId = 'sess-idem-1';
    insertSession(db, sessionId);
    insertMessage(db, 'msg-pre-1', sessionId, { agentId: 'a-idem-1' });

    const subagentDir = path.join(tmpProjectsDir, 'project-y', sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-idem-1.meta.json'),
      JSON.stringify({ agentType: 'general-purpose' }),
    );

    const inner = (db as unknown as { db: SqlJsDb }).db;
    inner.run("UPDATE messages SET subagent_type = 'preserved' WHERE uuid = 'msg-pre-1'");

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);
    expect(readSubagentType(db, 'msg-pre-1')).toBe('preserved');
  });

  it('does not fail when projects directory is missing', () => {
    expect(() => {
      (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(
        path.join(tmpProjectsDir, 'does-not-exist'),
      );
    }).not.toThrow();
  });

  it('does not double-run after recording the migration flag', () => {
    const sessionId = 'sess-flag-1';
    insertSession(db, sessionId);
    insertMessage(db, 'msg-flag-1', sessionId, { agentId: 'a-flag-1' });

    const subagentDir = path.join(tmpProjectsDir, 'project-z', sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-flag-1.meta.json'),
      JSON.stringify({ agentType: 'Explore' }),
    );

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);
    expect(readSubagentType(db, 'msg-flag-1')).toBe('Explore');

    // Change the meta.json: a re-run guarded by the migration flag should NOT pick up the change
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-flag-1.meta.json'),
      JSON.stringify({ agentType: 'Plan' }),
    );
    const inner = (db as unknown as { db: SqlJsDb }).db;
    inner.run("UPDATE messages SET subagent_type = NULL WHERE uuid = 'msg-flag-1'");

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);
    // Migration was already recorded → no rewrite
    expect(readSubagentType(db, 'msg-flag-1')).toBeNull();
  });
});
