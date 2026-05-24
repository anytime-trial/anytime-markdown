
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSessionCommit = (
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  committedAt: string,
  commitMessage: string | null = null,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, committed_at, commit_message)
     VALUES (?, ?, ?, ?)`,
    [sessionId, hash, committedAt, commitMessage ?? ''],
  );
};

const insertCommitFile = (db: TrailDatabase, hash: string, filePath: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
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
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
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

describe('TrailDatabase.fetchActivityTrendRows', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  test('returns empty when filePathsIn is empty', () => {
    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'commit',
      filePathsIn: [],
    });
    expect(rows).toHaveLength(0);
  });

  test('commit granularity returns committed_at and filePath rows', () => {
    insertSessionCommit(db, 's1', 'h1', '2026-04-25T10:00:00.000Z');
    insertCommitFile(db, 'h1', 'a.ts');
    insertCommitFile(db, 'h1', 'b.ts');

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'commit',
      filePathsIn: ['a.ts'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].filePath).toBe('a.ts');
    expect(rows[0].committedAt).toContain('2026-04-25');
  });

  test('defect granularity counts fix commits once even when multiple files match', () => {
    insertSessionCommit(db, 's1', 'fix1', '2026-04-25T10:00:00.000Z', 'fix: bug');
    insertSessionCommit(db, 's2', 'feat1', '2026-04-25T11:00:00.000Z', 'feat: feature');
    insertCommitFile(db, 'fix1', 'a.ts');
    insertCommitFile(db, 'fix1', 'b.ts');
    insertCommitFile(db, 'feat1', 'a.ts');

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'defect',
      filePathsIn: ['a.ts', 'b.ts'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].committedAt).toContain('2026-04-25');
  });

  test('subagent granularity exposes subagent_type and excludes nulls', () => {
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z', 'general-purpose');
    insertMessage(db, 'm2', 's1', '2026-04-25T11:00:00.000Z', null);
    insertToolCall(db, 'm1', 's1', 'Edit', 'a.ts', 0, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm2', 's1', 'Edit', 'a.ts', 0, '2026-04-25T11:00:00.000Z');

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'subagent',
      filePathsIn: ['a.ts'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].subagentType).toBe('general-purpose');
  });

  test('session granularity normalizes absolute tool file paths to repo-relative paths', () => {
    const projectRoot = '/repo-root';
    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
        ],
        edges: [],
        metadata: {
          projectRoot,
          analyzedAt: '2026-04-29T00:00:00.000Z',
          fileCount: 1,
        },
      },
      `${projectRoot}/tsconfig.json`,
      'commitX',
      'r',
    );
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Edit', `${projectRoot}/src/a.ts`, 0, '2026-04-25T10:00:00.000Z');

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'session',
      sessionMode: 'write',
      filePathsIn: ['src/a.ts'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].filePath).toBe('src/a.ts');
  });

  test('session read mode counts Read tool calls separately from write activity', () => {
    const projectRoot = '/repo-root';
    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
        ],
        edges: [],
        metadata: {
          projectRoot,
          analyzedAt: '2026-04-29T00:00:00.000Z',
          fileCount: 1,
        },
      },
      `${projectRoot}/tsconfig.json`,
      'commitX',
      'r',
    );
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z');
    insertMessage(db, 'm2', 's1', '2026-04-25T10:01:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Read', `${projectRoot}/src/a.ts`, 0, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm2', 's1', 'Edit', `${projectRoot}/src/a.ts`, 0, '2026-04-25T10:01:00.000Z');

    const readRows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'session',
      sessionMode: 'read',
      filePathsIn: ['src/a.ts'],
    });
    const writeRows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'session',
      sessionMode: 'write',
      filePathsIn: ['src/a.ts'],
    });

    expect(readRows).toHaveLength(1);
    expect(writeRows).toHaveLength(1);
    expect(readRows[0].committedAt).toContain('10:00');
    expect(writeRows[0].committedAt).toContain('10:01');
  });

  test('large filePathsIn (>900) uses temp-table fallback successfully', () => {
    insertSessionCommit(db, 's1', 'h1', '2026-04-25T10:00:00.000Z');
    insertCommitFile(db, 'h1', 'target.ts');
    const filePaths = ['target.ts', ...Array.from({ length: 1500 }, (_, i) => `f-${i}.ts`)];

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'commit',
      filePathsIn: filePaths,
    });
    expect(rows.find((r) => r.filePath === 'target.ts')).toBeDefined();
  });

  test('subagent granularity includes codex-linked sessions as "codex"', () => {
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
    insertToolCall(db, 'cm1', 'codex1', 'Edit', 'a.ts', 0, '2026-04-25T10:03:00.000Z');

    const rows = db.fetchActivityTrendRows({
      from: '2026-04-25T00:00:00.000Z',
      to: '2026-04-26T00:00:00.000Z',
      granularity: 'subagent',
      filePathsIn: ['a.ts'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].subagentType).toBe('codex');
  });
});
