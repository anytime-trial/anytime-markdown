// __non_webpack_require__ はwebpackグローバル。テスト環境では sql-asm.js を直接ロードするよう差し替え
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string) => Array<{ values: unknown[][] }>;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSessionCommit = (
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  committedAt: string,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, committed_at)
     VALUES (?, ?, ?)`,
    [sessionId, hash, committedAt],
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
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
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

describe('TrailDatabase.fetchHotspotRows', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  test('commit granularity counts distinct commits per file', () => {
    insertSessionCommit(db, 's1', 'h1', '2026-04-25T10:00:00.000Z');
    insertSessionCommit(db, 's1', 'h2', '2026-04-26T10:00:00.000Z');
    insertCommitFile(db, 'h1', 'a.ts');
    insertCommitFile(db, 'h1', 'b.ts');
    insertCommitFile(db, 'h2', 'a.ts');

    const rows = db.fetchHotspotRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'commit',
    });
    const map = new Map(rows.map((r) => [r.filePath, r.churn]));
    expect(map.get('a.ts')).toBe(2);
    expect(map.get('b.ts')).toBe(1);
  });

  test('rows outside the range are excluded', () => {
    insertSessionCommit(db, 's1', 'h_in', '2026-04-25T10:00:00.000Z');
    insertSessionCommit(db, 's1', 'h_out', '2026-01-01T10:00:00.000Z');
    insertCommitFile(db, 'h_in', 'a.ts');
    insertCommitFile(db, 'h_out', 'a.ts');
    const rows = db.fetchHotspotRows({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'commit',
    });
    expect(rows.find((r) => r.filePath === 'a.ts')?.churn).toBe(1);
  });

  test('session granularity counts Edit/Write/NotebookEdit tool calls', () => {
    insertMessage(db, 'm1', 's1', '2026-04-25T10:00:00.000Z');
    insertMessage(db, 'm2', 's1', '2026-04-26T10:00:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Edit', 'a.ts', 0, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm1', 's1', 'Read', 'a.ts', 1, '2026-04-25T10:00:00.000Z');
    insertToolCall(db, 'm2', 's1', 'Write', 'a.ts', 0, '2026-04-26T10:00:00.000Z');
    insertToolCall(db, 'm2', 's1', 'Write', 'b.ts', 1, '2026-04-26T10:00:00.000Z');
    const rows = db.fetchHotspotRows({
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      granularity: 'session',
    });
    const map = new Map(rows.map((r) => [r.filePath, r.churn]));
    expect(map.get('a.ts')).toBe(2); // Edit + Write (Read excluded)
    expect(map.get('b.ts')).toBe(1);
  });

  test('EXPLAIN QUERY PLAN uses an index for commit granularity', () => {
    const plan = inner(db).exec(
      `EXPLAIN QUERY PLAN
       SELECT cf.file_path, COUNT(DISTINCT cf.commit_hash)
       FROM commit_files cf
       INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
       WHERE sc.committed_at >= '2026-04-01' AND sc.committed_at <= '2026-05-01'
       GROUP BY cf.file_path`,
    );
    const text = JSON.stringify(plan);
    expect(text).toMatch(/USING\s+(INDEX|COVERING|AUTOMATIC|PRIMARY KEY)/i);
  });
});
