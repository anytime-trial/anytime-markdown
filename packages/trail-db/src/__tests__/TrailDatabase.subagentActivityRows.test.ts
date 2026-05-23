
import { TrailDatabase, SESSION_COUPLING_EDIT_TOOLS } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const insertSession = (
  db: TrailDatabase,
  sessionId: string,
  startTime: string,
  endTime: string,
  source: 'claude_code' | 'codex',
  repoName = 'r',
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
  inner.run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source
     ) VALUES (?, ?, ?, '0', '', '', ?, ?, 0, '', 0, '', ?)`,
    [sessionId, sessionId, repoId, startTime, endTime, source],
  );
};

const insertMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  timestamp: string,
  opts: { subagentType?: string | null; sourceToolAssistantUuid?: string | null } = {},
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, parent_uuid, type, timestamp, subagent_type, source_tool_assistant_uuid
     ) VALUES (?, ?, NULL, 'assistant', ?, ?, ?)`,
    [uuid, sessionId, timestamp, opts.subagentType ?? null, opts.sourceToolAssistantUuid ?? null],
  );
};

const insertToolCall = (
  db: TrailDatabase,
  sessionId: string,
  uuid: string,
  callIndex: number,
  toolName: string,
  filePath: string | null,
  timestamp: string,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking, is_error, error_type, timestamp
     ) VALUES (?, ?, 0, ?, ?, ?, NULL, NULL, NULL, 0, NULL, 0, 0, NULL, ?)`,
    [sessionId, uuid, callIndex, toolName, filePath, timestamp],
  );
};

describe('TrailDatabase.fetchSubagentActivityRows', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('returns CC subagent rows where subagent_type is set', () => {
    insertSession(db, 's1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'm1', 's1', '2026-04-29T00:30:00.000Z', { subagentType: 'Explore' });
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts', '2026-04-29T00:30:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        subagentType: 'Explore',
        filePath: 'src/a.ts',
        sessionId: 's1',
        messageUuid: 'm1',
      }),
    ]);
  });

  it('skips messages with NULL subagent_type from path A', () => {
    insertSession(db, 's1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'm1', 's1', '2026-04-29T00:30:00.000Z', { subagentType: null });
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts', '2026-04-29T00:30:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toHaveLength(0);
  });

  it('returns codex linked rows with subagentType="codex"', () => {
    // CC parent session with a delegation marker
    insertSession(db, 'cc1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'parent-uuid', 'cc1', '2026-04-29T00:10:00.000Z', { subagentType: null });
    // child message in CC session pointing to parent (delegation marker — same session in JSONL)
    insertMessage(db, 'cc1-child', 'cc1', '2026-04-29T00:11:00.000Z', {
      sourceToolAssistantUuid: 'parent-uuid',
    });

    // codex session in same repo, time-overlapping
    insertSession(db, 'codex1', '2026-04-29T00:11:30.000Z', '2026-04-29T00:14:00.000Z', 'codex');
    insertMessage(db, 'cm1', 'codex1', '2026-04-29T00:13:00.000Z', { subagentType: null });
    insertToolCall(db, 'codex1', 'cm1', 0, 'Write', 'src/c.ts', '2026-04-29T00:13:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        subagentType: 'codex',
        filePath: 'src/c.ts',
        sessionId: 'codex1',
        messageUuid: 'cm1',
      }),
    ]);
  });

  it('merges CC subagent and codex rows', () => {
    insertSession(db, 'cc1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'parent-uuid', 'cc1', '2026-04-29T00:05:00.000Z', { subagentType: 'Explore' });
    insertToolCall(db, 'cc1', 'parent-uuid', 0, 'Edit', 'src/a.ts', '2026-04-29T00:05:00.000Z');
    insertMessage(db, 'cc1-child', 'cc1', '2026-04-29T00:06:00.000Z', {
      sourceToolAssistantUuid: 'parent-uuid',
    });

    insertSession(db, 'codex1', '2026-04-29T00:06:30.000Z', '2026-04-29T00:09:00.000Z', 'codex');
    insertMessage(db, 'cm1', 'codex1', '2026-04-29T00:08:00.000Z');
    insertToolCall(db, 'codex1', 'cm1', 0, 'Write', 'src/b.ts', '2026-04-29T00:08:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toHaveLength(2);
    const labels = rows.map((r) => r.subagentType).sort();
    expect(labels).toEqual(['Explore', 'codex']);
    // ordered by committedAt
    expect(rows[0].committedAt < rows[1].committedAt).toBe(true);
  });

  it('returns empty when no subagent_type and no codex linkage', () => {
    insertSession(db, 's1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'm1', 's1', '2026-04-29T00:30:00.000Z');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts', '2026-04-29T00:30:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toHaveLength(0);
  });

  it('respects toolNames filter', () => {
    insertSession(db, 's1', '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z', 'claude_code');
    insertMessage(db, 'm1', 's1', '2026-04-29T00:30:00.000Z', { subagentType: 'Explore' });
    insertToolCall(db, 's1', 'm1', 0, 'Bash', 'src/a.ts', '2026-04-29T00:30:00.000Z');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts', '2026-04-29T00:30:00.000Z');

    const rows = db.fetchSubagentActivityRows({
      from: '2026-04-29T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].filePath).toBe('src/b.ts');
  });
});
