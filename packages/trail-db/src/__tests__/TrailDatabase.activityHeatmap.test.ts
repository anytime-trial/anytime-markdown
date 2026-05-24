
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSession = (db: TrailDatabase, id: string, slug = id): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [id, slug],
  );
};

const insertMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  timestamp: string,
  subagentType: string | null = null,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO messages (uuid, session_id, type, timestamp, subagent_type)
     VALUES (?, ?, 'assistant', ?, ?)`,
    [uuid, sessionId, timestamp, subagentType],
  );
};

const insertToolCall = (
  db: TrailDatabase,
  messageUuid: string,
  sessionId: string,
  toolName: string,
  filePath: string,
  callIndex: number,
  timestamp: string,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path, timestamp
     ) VALUES (?, ?, 0, ?, ?, ?, ?)`,
    [sessionId, messageUuid, callIndex, toolName, filePath, timestamp],
  );
};

describe('TrailDatabase.fetchActivityHeatmapRows', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  test('session-file mode aggregates by session × file', () => {
    insertSession(db, 's1', 'slug-1');
    insertSession(db, 's2', 'slug-2');
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z');
    insertMessage(db, 'm2', 's2', '2026-04-26T10:00:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Edit', 'a.ts', 0, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Edit', 'a.ts', 1, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm2', 's2', 'Write', 'b.ts', 0, '2026-04-26T10:00:00.000Z');

    const rows = db.fetchActivityHeatmapRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      mode: 'session-file',
    });
    const s1Cell = rows.find((r) => r.rowId === 's1' && r.filePath === 'a.ts');
    expect(s1Cell?.count).toBe(2);
    expect(s1Cell?.rowLabel).toContain('slug-1');
    const s2Cell = rows.find((r) => r.rowId === 's2' && r.filePath === 'b.ts');
    expect(s2Cell?.count).toBe(1);
  });

  test('subagent-file mode uses subagent_type as rowId', () => {
    insertSession(db, 's1');
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z', 'general-purpose');
    insertMessage(db, 'm2', 's1', '2026-04-25T11:00:00.000Z', 'Explore');
    insertMessage(db, 'm3', 's1', '2026-04-25T12:00:00.000Z', null);
    insertToolCall(db, 'm1', 's1', 'Edit', 'a.ts', 0, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm2', 's1', 'Edit', 'a.ts', 0, '2026-04-25T11:00:00.000Z');
    insertToolCall(db, 'm3', 's1', 'Edit', 'a.ts', 0, '2026-04-25T12:00:00.000Z');

    const rows = db.fetchActivityHeatmapRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      mode: 'subagent-file',
    });
    const ids = rows.map((r) => r.rowId);
    expect(ids).toContain('general-purpose');
    expect(ids).toContain('Explore');
    expect(ids).not.toContain(null);
  });

  test('rowLimit caps the number of distinct rowIds', () => {
    insertSession(db, 's_main');
    for (let i = 0; i < 20; i++) {
      const sid = `session-${String(i).padStart(2, '0')}`;
      insertSession(db, sid);
      insertMessage(db, `m${i}`, sid, '2026-04-25T10:00:00.000Z');
      insertToolCall(db, `m${i}`, sid, 'Edit', 'a.ts', 0, '2026-04-25T10:00:00.000Z');
    }
    const rows = db.fetchActivityHeatmapRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      mode: 'session-file',
      rowLimit: 5,
    });
    const distinctRows = new Set(rows.map((r) => r.rowId));
    expect(distinctRows.size).toBeLessThanOrEqual(5);
  });

  test('subagent-file mode includes codex-linked sessions as rowId="codex"', () => {
    // CC parent session + delegation marker
    inner(db).run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('cc1', 'cc1', '0', '', '', '2026-04-25T10:00:00.000Z', '2026-04-25T11:00:00.000Z', 0, '', 0, '', 'claude_code')`,
    );
    inner(db).run(
      `INSERT INTO messages (uuid, session_id, type, timestamp, source_tool_assistant_uuid)
       VALUES ('cc1-child', 'cc1', 'assistant', '2026-04-25T10:01:00.000Z', 'p-uuid')`,
    );
    // codex session in same repo, time-overlapping
    inner(db).run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('codex1', 'codex1', '0', '', '', '2026-04-25T10:02:00.000Z', '2026-04-25T10:05:00.000Z', 0, '', 0, '', 'codex')`,
    );
    inner(db).run(
      `INSERT INTO messages (uuid, session_id, type, timestamp)
       VALUES ('cm1', 'codex1', 'assistant', '2026-04-25T10:03:00.000Z')`,
    );
    insertToolCall(db, 'cm1', 'codex1', 'Edit', 'src/c.ts', 0, '2026-04-25T10:03:00.000Z');

    const rows = db.fetchActivityHeatmapRows({
      from: '2026-04-25T00:00:00.000Z',
      to: '2026-04-26T00:00:00.000Z',
      mode: 'subagent-file',
    });
    const codexCell = rows.find((r) => r.rowId === 'codex' && r.filePath === 'src/c.ts');
    expect(codexCell?.count).toBe(1);
  });
});
