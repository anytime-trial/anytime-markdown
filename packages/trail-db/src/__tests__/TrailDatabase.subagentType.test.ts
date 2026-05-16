
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const insertParentSession = (db: TrailDatabase, sessionId: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', '2026-04-29T00:00:00.000Z', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
};

describe('TrailDatabase.importSession - subagent_type extraction', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-subagent-test-'));
  });

  afterEach(() => {
    db.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
  });

  it('extracts subagent_type from parent Agent tool_use into the parent message', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const messageUuid = 'parent-msg-uuid';
    const lines = [
      JSON.stringify({
        type: 'user',
        sessionId,
        uuid: 'user-1',
        timestamp: '2026-04-29T00:00:00.000Z',
        version: '2.1.122',
        message: { role: 'user', content: 'go' },
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId,
        uuid: messageUuid,
        timestamp: '2026-04-29T00:00:01.000Z',
        version: '2.1.122',
        message: {
          role: 'assistant',
          model: 'opus',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_X',
              name: 'Agent',
              input: {
                description: 'Investigate flow',
                subagent_type: 'general-purpose',
                model: 'sonnet',
                prompt: 'do it',
              },
            },
          ],
        },
      }),
    ];
    const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n'));

    db.importSession(filePath, 'repo', false, false);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    const result = inner.exec(
      'SELECT subagent_type FROM messages WHERE uuid = ?',
      [messageUuid],
    );
    expect(result[0]?.values[0]?.[0]).toBe('general-purpose');
  });

  it('extracts subagent_type from agent meta.json for sub-agent JSONL', () => {
    const sessionId = '22222222-2222-2222-2222-222222222222';
    const agentId = 'a-test-id-1';
    const subDir = path.join(tmpDir, sessionId, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });

    const subFile = path.join(subDir, `agent-${agentId}.jsonl`);
    const metaFile = path.join(subDir, `agent-${agentId}.meta.json`);
    fs.writeFileSync(metaFile, JSON.stringify({ agentType: 'Explore', description: 'find files' }));

    const subLines = [
      JSON.stringify({
        type: 'user',
        sessionId,
        agentId,
        isSidechain: true,
        uuid: 'sub-user-1',
        timestamp: '2026-04-29T00:00:10.000Z',
        message: { role: 'user', content: 'task' },
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId,
        agentId,
        isSidechain: true,
        uuid: 'sub-asst-1',
        timestamp: '2026-04-29T00:00:11.000Z',
        message: {
          role: 'assistant',
          model: 'sonnet',
          content: [{ type: 'text', text: 'done' }],
        },
      }),
    ];
    fs.writeFileSync(subFile, subLines.join('\n'));

    insertParentSession(db, sessionId);
    db.importSession(subFile, 'repo', true, false);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    const result = inner.exec(
      'SELECT uuid, subagent_type FROM messages WHERE session_id = ? ORDER BY uuid',
      [sessionId],
    );
    const rows = result[0]?.values ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row[1]).toBe('Explore');
    }
  });

  it('leaves subagent_type NULL when sub-agent JSONL lacks meta.json (older sessions)', () => {
    const sessionId = '33333333-3333-3333-3333-333333333333';
    const agentId = 'a-old-id-1';
    const subDir = path.join(tmpDir, sessionId, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });

    const subFile = path.join(subDir, `agent-${agentId}.jsonl`);
    const subLines = [
      JSON.stringify({
        type: 'user',
        sessionId,
        agentId,
        isSidechain: true,
        uuid: 'sub-old-1',
        timestamp: '2026-03-01T00:00:00.000Z',
        message: { role: 'user', content: 'old task' },
      }),
    ];
    fs.writeFileSync(subFile, subLines.join('\n'));

    insertParentSession(db, sessionId);
    db.importSession(subFile, 'repo', true, false);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    const result = inner.exec(
      'SELECT subagent_type FROM messages WHERE uuid = ?',
      ['sub-old-1'],
    );
    expect(result[0]?.values[0]?.[0]).toBeNull();
  });

  it('keeps subagent_type NULL for assistant messages without Agent tool_use', () => {
    const sessionId = '44444444-4444-4444-4444-444444444444';
    const messageUuid = 'plain-asst-1';
    const lines = [
      JSON.stringify({
        type: 'assistant',
        sessionId,
        uuid: messageUuid,
        timestamp: '2026-04-29T00:00:00.000Z',
        message: {
          role: 'assistant',
          model: 'opus',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_Y',
              name: 'Read',
              input: { file_path: '/a' },
            },
          ],
        },
      }),
    ];
    const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n'));

    db.importSession(filePath, 'repo', false, false);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    const result = inner.exec(
      'SELECT subagent_type FROM messages WHERE uuid = ?',
      [messageUuid],
    );
    expect(result[0]?.values[0]?.[0]).toBeNull();
  });
});
