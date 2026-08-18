
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TrailDatabase } from '../TrailDatabase';
import { readSubagentMeta } from '../sessionImport';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const insertSession = (db: TrailDatabase, sessionId: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO activity_sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '2026-04-29T00:00:00.000Z', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
};

const insertMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  fields: { agentId?: string; toolCalls?: string; sourceToolUseId?: string } = {},
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO activity_messages (
       uuid, session_id, parent_uuid, type, timestamp, agent_id, tool_calls, source_tool_use_id
     ) VALUES (?, ?, NULL, 'assistant', '2026-04-29T00:00:00.000Z', ?, ?, ?)`,
    [uuid, sessionId, fields.agentId ?? null, fields.toolCalls ?? null, fields.sourceToolUseId ?? null],
  );
};

const readSubagentType = (db: TrailDatabase, uuid: string): string | null => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  const result = inner.exec('SELECT subagent_type FROM activity_messages WHERE uuid = ?', [uuid]);
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
    inner.run("DELETE FROM _migrations WHERE key = 'agent_source_tool_use_id_backfill_v1'");
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
    inner.run("UPDATE activity_messages SET subagent_type = 'preserved' WHERE uuid = 'msg-pre-1'");

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
    inner.run("UPDATE activity_messages SET subagent_type = NULL WHERE uuid = 'msg-flag-1'");

    (db as unknown as { backfillSubagentType: (dir: string) => void }).backfillSubagentType(tmpProjectsDir);
    // Migration was already recorded → no rewrite
    expect(readSubagentType(db, 'msg-flag-1')).toBeNull();
  });

  it('backfills source_tool_use_id without overwriting existing values and is idempotent', () => {
    const sessionId = 'sess-source-link';
    insertSession(db, sessionId);
    insertMessage(db, 'msg-source-null', sessionId, { agentId: 'a-source' });
    insertMessage(db, 'msg-source-set', sessionId, { agentId: 'a-source', sourceToolUseId: 'preserved' });
    const subagentDir = path.join(tmpProjectsDir, 'project-source', sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(subagentDir, 'agent-a-source.meta.json'),
      JSON.stringify({ agentType: 'Explore', toolUseId: 'toolu_parent' }),
    );

    const target = db as unknown as { backfillAgentSourceToolUseId: (dir: string) => void };
    target.backfillAgentSourceToolUseId(tmpProjectsDir);
    target.backfillAgentSourceToolUseId(tmpProjectsDir);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    const rows = inner.exec(
      'SELECT uuid, source_tool_use_id FROM activity_messages WHERE uuid LIKE ? ORDER BY uuid',
      ['msg-source-%'],
    )[0]?.values;
    expect(rows).toEqual([
      ['msg-source-null', 'toolu_parent'],
      ['msg-source-set', 'preserved'],
    ]);
    expect(readSubagentType(db, 'msg-source-null')).toBeNull();
  });
});

describe('readSubagentMeta and import source_tool_use_id', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-subagent-meta-test-')); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('reads valid meta, returns null when absent, and reports malformed JSON with its path', () => {
    const jsonl = path.join(tmpDir, 'agent-a.jsonl');
    expect(readSubagentMeta(jsonl)).toBeNull();
    const metaPath = path.join(tmpDir, 'agent-a.meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({ toolUseId: 'toolu_1', agentType: 'reviewer', model: 'sonnet' }));
    expect(readSubagentMeta(jsonl)).toEqual({ toolUseId: 'toolu_1', agentType: 'reviewer', model: 'sonnet' });
    fs.writeFileSync(metaPath, '{broken');
    expect(() => readSubagentMeta(jsonl)).toThrow(metaPath);
  });

  it.each([
    ['with meta', true, 'toolu_parent'],
    ['without meta', false, null],
  ])('imports a subagent transcript %s', async (_label, withMeta, expected) => {
    const db = await createTestTrailDatabase();
    try {
      const sessionId = `session-${withMeta ? 'meta' : 'missing'}`;
      insertSession(db, sessionId);
      const subDir = path.join(tmpDir, sessionId, 'subagents');
      fs.mkdirSync(subDir, { recursive: true });
      const jsonl = path.join(subDir, 'agent-child.jsonl');
      fs.writeFileSync(jsonl, JSON.stringify({
        type: 'user', sessionId, agentId: 'child', uuid: `msg-${sessionId}`,
        timestamp: '2026-08-18T00:00:00.000Z', message: { content: 'task' },
      }));
      if (withMeta) fs.writeFileSync(jsonl.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ toolUseId: 'toolu_parent' }));
      expect(db.importSession(jsonl, 'repo', true)).toBe(1);
      const inner = (db as unknown as { db: SqlJsDb }).db;
      expect(inner.exec('SELECT source_tool_use_id FROM activity_messages WHERE uuid = ?', [`msg-${sessionId}`])[0]?.values[0]?.[0] ?? null).toBe(expected);
    } finally {
      db.close();
    }
  });

  it('prefers sourceToolUseID from JSONL over meta.json', async () => {
    const db = await createTestTrailDatabase();
    try {
      insertSession(db, 'session-precedence');
      const jsonl = path.join(tmpDir, 'agent-precedence.jsonl');
      fs.writeFileSync(jsonl, JSON.stringify({
        type: 'user', sessionId: 'session-precedence', agentId: 'child', uuid: 'msg-precedence',
        sourceToolUseID: 'toolu_jsonl', timestamp: '2026-08-18T00:00:00.000Z', message: { content: 'task' },
      }));
      fs.writeFileSync(jsonl.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ toolUseId: 'toolu_meta' }));
      db.importSession(jsonl, 'repo', true);
      const inner = (db as unknown as { db: SqlJsDb }).db;
      expect(inner.exec('SELECT source_tool_use_id FROM activity_messages WHERE uuid = ?', ['msg-precedence'])[0]?.values[0]?.[0]).toBe('toolu_jsonl');
    } finally {
      db.close();
    }
  });

  it('warns with the meta path and continues importing malformed meta.json', async () => {
    const warn = jest.fn();
    const db = await createTestTrailDatabase({ info: jest.fn(), warn, error: jest.fn(), debugSql: jest.fn() });
    try {
      insertSession(db, 'session-broken');
      const jsonl = path.join(tmpDir, 'agent-broken.jsonl');
      fs.writeFileSync(jsonl, JSON.stringify({
        type: 'user', sessionId: 'session-broken', agentId: 'child', uuid: 'msg-broken',
        timestamp: '2026-08-18T00:00:00.000Z', message: { content: 'task' },
      }));
      const metaPath = jsonl.replace(/\.jsonl$/, '.meta.json');
      fs.writeFileSync(metaPath, '{broken');
      expect(db.importSession(jsonl, 'repo', true)).toBe(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(metaPath));
      const inner = (db as unknown as { db: SqlJsDb }).db;
      expect(inner.exec('SELECT source_tool_use_id FROM activity_messages WHERE uuid = ?', ['msg-broken'])[0]?.values[0]?.[0]).toBeNull();
    } finally {
      db.close();
    }
  });
});
