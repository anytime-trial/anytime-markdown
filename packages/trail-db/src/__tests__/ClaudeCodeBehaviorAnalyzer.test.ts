import BetterSqlite3 from 'better-sqlite3';
import { SqlJsCompatDatabase } from '../internal/SqlJsCompatDatabase';
import { ClaudeCodeBehaviorAnalyzer } from '../ClaudeCodeBehaviorAnalyzer';

/**
 * Create a minimal in-memory DB with the tables ClaudeCodeBehaviorAnalyzer needs.
 */
function makeDb(): SqlJsCompatDatabase {
  const inner = new BetterSqlite3(':memory:');
  const db = new SqlJsCompatDatabase(inner);

  // Minimal sessions table (FK target)
  db.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      slug TEXT,
      repo_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      entrypoint TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      start_time TEXT,
      end_time TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT ''
    ) STRICT
  `);

  // messages table (source data)
  db.run(`
    CREATE TABLE messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT '',
      text_content TEXT,
      tool_calls TEXT,
      tool_use_result TEXT,
      model TEXT,
      skill TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      parent_uuid TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_creation_input_tokens INTEGER,
      cache_read_input_tokens INTEGER
    ) STRICT
  `);

  // message_tool_calls table (destination)
  db.run(`
    CREATE TABLE message_tool_calls (
      session_id TEXT NOT NULL,
      message_uuid TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      call_index INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      file_path TEXT,
      command TEXT,
      skill_name TEXT,
      model TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      turn_exec_ms INTEGER,
      has_thinking INTEGER NOT NULL DEFAULT 0,
      is_error INTEGER NOT NULL DEFAULT 0,
      error_type TEXT,
      timestamp TEXT NOT NULL DEFAULT '',
      UNIQUE (message_uuid, call_index)
    ) STRICT
  `);

  return db;
}

function insertSession(db: SqlJsCompatDatabase, id: string): void {
  db.run(
    `INSERT INTO sessions (id, slug, repo_name, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, '', '', '', '', '', '', 0, '', 0, '')`,
    [id, id],
  );
}

function insertMessage(
  db: SqlJsCompatDatabase,
  opts: {
    uuid: string;
    sessionId: string;
    type: string;
    timestamp: string;
    toolCalls?: unknown[] | null;
    toolUseResult?: unknown[] | null;
    parentUuid?: string | null;
    model?: string | null;
    skill?: string | null;
    isSidechain?: number;
  },
): void {
  db.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, tool_calls, tool_use_result, model, skill, is_sidechain, parent_uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.uuid,
      opts.sessionId,
      opts.type,
      opts.timestamp,
      opts.toolCalls != null ? JSON.stringify(opts.toolCalls) : null,
      opts.toolUseResult != null ? JSON.stringify(opts.toolUseResult) : null,
      opts.model ?? null,
      opts.skill ?? null,
      opts.isSidechain ?? 0,
      opts.parentUuid ?? null,
    ],
  );
}

describe('ClaudeCodeBehaviorAnalyzer', () => {
  it('does nothing when session has no assistant messages', () => {
    const db = makeDb();
    insertSession(db, 's1');
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec('SELECT COUNT(*) AS c FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(0);
    db.close();
  });

  it('skips assistant messages without tool_calls', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: null,
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec('SELECT COUNT(*) AS c FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(0);
    db.close();
  });

  it('inserts tool call rows for assistant messages', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [
        { id: 'c1', name: 'Read', input: { file_path: 'foo.ts' } },
        { id: 'c2', name: 'Bash', input: { command: 'ls' } },
      ],
      model: 'claude-opus-4',
      skill: null,
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);

    const result = db.exec(
      'SELECT tool_name, call_index FROM message_tool_calls ORDER BY call_index',
    );
    expect(result[0].values).toEqual([
      ['Read', 0],
      ['Bash', 1],
    ]);
    db.close();
  });

  it('records file_path extracted from Read tool', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: { file_path: 'src/index.ts' } }],
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);

    const result = db.exec('SELECT file_path FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe('src/index.ts');
    db.close();
  });

  it('records is_error=1 when tool_use_result has is_error=true', () => {
    const db = makeDb();
    insertSession(db, 's1');
    // assistant message with tool_use
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Bash', input: { command: 'bad command' } }],
    });
    // user message (tool result) referencing m1 as parent
    insertMessage(db, {
      uuid: 'm2',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-04-29T00:00:01.000Z',
      parentUuid: 'm1',
      toolUseResult: [
        { type: 'tool_result', tool_use_id: 'c1', is_error: true, content: 'command not found' },
      ],
    });

    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);

    const result = db.exec('SELECT is_error, error_type FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(1);
    // error_type should be non-null
    expect(result[0].values[0][1]).not.toBeNull();
    db.close();
  });

  it('records is_error=0 when tool_use_result has is_error=false', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: { file_path: 'a.ts' } }],
    });
    insertMessage(db, {
      uuid: 'm2',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-04-29T00:00:01.000Z',
      parentUuid: 'm1',
      toolUseResult: [
        { type: 'tool_result', tool_use_id: 'c1', is_error: false, content: 'ok' },
      ],
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec('SELECT is_error, error_type FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(0);
    expect(result[0].values[0][1]).toBeNull();
    db.close();
  });

  it('computes turn_exec_ms from next user message timestamp', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: { file_path: 'x.ts' } }],
    });
    insertMessage(db, {
      uuid: 'm2',
      sessionId: 's1',
      type: 'user',
      timestamp: '2026-04-29T00:00:02.000Z', // 2 seconds later
      parentUuid: 'm1',
      toolUseResult: null,
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec('SELECT turn_exec_ms FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(2000);
    db.close();
  });

  it('handles malformed tool_calls JSON gracefully (skips message)', () => {
    const db = makeDb();
    insertSession(db, 's1');
    // Insert with invalid JSON for tool_calls
    db.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp, tool_calls, is_sidechain)
       VALUES ('m1', 's1', 'assistant', '2026-04-29T00:00:00.000Z', 'NOT-VALID-JSON', 0)`,
    );
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    expect(() => analyzer.analyze('s1', db)).not.toThrow();
    const result = db.exec('SELECT COUNT(*) AS c FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(0);
    db.close();
  });

  it('handles malformed tool_use_result JSON gracefully', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: { file_path: 'a.ts' } }],
    });
    // User message with invalid tool_use_result JSON
    db.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp, tool_use_result, parent_uuid, is_sidechain)
       VALUES ('m2', 's1', 'user', '2026-04-29T00:00:01.000Z', 'INVALID-JSON', 'm1', 0)`,
    );
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    expect(() => analyzer.analyze('s1', db)).not.toThrow();
    // Row should still be inserted (just without error info)
    const result = db.exec('SELECT COUNT(*) AS c FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(1);
    db.close();
  });

  it('is idempotent — duplicate analyze calls do not create duplicate rows', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: { file_path: 'a.ts' } }],
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    analyzer.analyze('s1', db); // second call should be no-op
    const result = db.exec('SELECT COUNT(*) AS c FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(1);
    db.close();
  });

  it('handles tool_use_result as single object (not array)', () => {
    const db = makeDb();
    insertSession(db, 's1');
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Bash', input: { command: 'ls' } }],
    });
    // Non-array tool_use_result
    db.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp, tool_use_result, parent_uuid, is_sidechain)
       VALUES ('m2', 's1', 'user', '2026-04-29T00:00:01.000Z',
         '{"type":"tool_result","tool_use_id":"c1","is_error":false,"content":"ok"}',
         'm1', 0)`,
    );
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec('SELECT is_error FROM message_tool_calls');
    expect(result[0].values[0][0]).toBe(0);
    db.close();
  });

  it('assigns incrementing turn_index per assistant turn with tool_calls', () => {
    const db = makeDb();
    insertSession(db, 's1');
    // m1: assistant with tool_calls -> turn_index=0
    insertMessage(db, {
      uuid: 'm1',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:00.000Z',
      toolCalls: [{ id: 'c1', name: 'Read', input: {} }],
    });
    // m2: assistant with tool_calls -> turn_index=1
    insertMessage(db, {
      uuid: 'm2',
      sessionId: 's1',
      type: 'assistant',
      timestamp: '2026-04-29T00:00:01.000Z',
      toolCalls: [{ id: 'c2', name: 'Edit', input: {} }],
    });
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze('s1', db);
    const result = db.exec(
      'SELECT message_uuid, turn_index FROM message_tool_calls ORDER BY turn_index',
    );
    expect(result[0].values[0]).toEqual(['m1', 0]);
    expect(result[0].values[1]).toEqual(['m2', 1]);
    db.close();
  });
});
