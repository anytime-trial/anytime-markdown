
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function insertSessionCommit(db: TrailDatabase, sessionId: string, hash: string, msg: string, at: string): void {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at) VALUES (?, ?, ?, ?)`,
    [sessionId, hash, msg, at],
  );
}

function insertCommitFile(db: TrailDatabase, hash: string, filePath: string): void {
  (db as unknown as { db: SqlJsDb }).db.run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
}

describe('TrailDatabase.fetchDefectRisk', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });

  it('returns empty array when no data', () => {
    const result = db.fetchDefectRisk({ windowDays: 90, halfLifeDays: 90 });
    expect(result).toEqual([]);
  });

  it('returns file-level risk entries', () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    insertSessionCommit(db, 's1', 'h1', 'fix: crash', recent);
    insertCommitFile(db, 'h1', 'packages/trail-core/src/foo.ts');
    const result = db.fetchDefectRisk({ windowDays: 90, halfLifeDays: 90 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].filePath).toBe('packages/trail-core/src/foo.ts');
    expect(result[0].fixCount).toBe(1);
  });

  it('excludes commits outside the window', () => {
    insertSessionCommit(db, 's1', 'h1', 'fix: old', '2020-01-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/trail-core/src/foo.ts');
    const result = db.fetchDefectRisk({ windowDays: 7, halfLifeDays: 90 });
    expect(result).toEqual([]);
  });
});
