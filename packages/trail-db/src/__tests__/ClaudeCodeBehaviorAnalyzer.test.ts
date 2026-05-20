// Minimal characterization test for ClaudeCodeBehaviorAnalyzer
// Verifies that analyze() writes tool call rows and handles edge cases.

import { ClaudeCodeBehaviorAnalyzer } from '../ClaudeCodeBehaviorAnalyzer';
import { createTestTrailDatabase } from './support/createTestDb';
import type { SqlJsCompatDatabase } from '../internal/SqlJsCompatDatabase';

// Access internal SqlJsCompatDatabase from TrailDatabase
type TestTrailDb = {
  ensureDb(): SqlJsCompatDatabase;
  close(): void;
};

describe('ClaudeCodeBehaviorAnalyzer.analyze', () => {
  it('writes tool call rows for an assistant message with tool_calls', async () => {
    const trailDb = await createTestTrailDatabase();
    const db = (trailDb as unknown as TestTrailDb).ensureDb();

    const sessionId = 'test-session-1';
    const msgUuid = 'msg-uuid-1';
    const now = new Date().toISOString();

    db.run(
      `INSERT OR IGNORE INTO sessions
        (id, slug, repo_name, version, entrypoint, model, start_time, end_time,
         message_count, file_path, file_size, imported_at)
       VALUES (?, ?, ?, '0', '', '', ?, ?, 0, '', 0, ?)`,
      [sessionId, 'test-session', 'repo-a', now, now, now],
    );

    db.run(
      `INSERT OR IGNORE INTO messages
        (uuid, session_id, type, timestamp, text_content, tool_calls)
       VALUES (?, ?, 'assistant', ?, '', ?)`,
      [msgUuid, sessionId, now,
        JSON.stringify([{ id: 'call-1', name: 'Read', input: { file_path: 'src/index.ts' } }])],
    );

    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    expect(() => analyzer.analyze(sessionId, db)).not.toThrow();

    const result = db.exec(
      'SELECT tool_name FROM message_tool_calls WHERE session_id = ?',
      [sessionId],
    );
    expect(result[0]?.values).toHaveLength(1);
    expect(result[0]?.values[0]?.[0]).toBe('Read');

    trailDb.close();
  });

  it('skips gracefully when no assistant messages exist', async () => {
    const trailDb = await createTestTrailDatabase();
    const db = (trailDb as unknown as TestTrailDb).ensureDb();

    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    expect(() => analyzer.analyze('nonexistent-session', db)).not.toThrow();

    trailDb.close();
  });

  it('skips a message whose tool_calls JSON is malformed', async () => {
    const trailDb = await createTestTrailDatabase();
    const db = (trailDb as unknown as TestTrailDb).ensureDb();

    const sessionId = 'test-session-malformed';
    const now = new Date().toISOString();

    db.run(
      `INSERT OR IGNORE INTO sessions
        (id, slug, repo_name, version, entrypoint, model, start_time, end_time,
         message_count, file_path, file_size, imported_at)
       VALUES (?, ?, ?, '0', '', '', ?, ?, 0, '', 0, ?)`,
      [sessionId, 'test-session-m', 'repo-a', now, now, now],
    );

    db.run(
      `INSERT OR IGNORE INTO messages
        (uuid, session_id, type, timestamp, text_content, tool_calls)
       VALUES (?, ?, 'assistant', ?, '', ?)`,
      ['msg-bad', sessionId, now, '{not valid json['],
    );

    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    expect(() => analyzer.analyze(sessionId, db)).not.toThrow();

    const result = db.exec(
      'SELECT COUNT(*) FROM message_tool_calls WHERE session_id = ?',
      [sessionId],
    );
    expect(result[0]?.values[0]?.[0]).toBe(0);

    trailDb.close();
  });
});
