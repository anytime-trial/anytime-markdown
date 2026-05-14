
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function inner(db: TrailDatabase): SqlJsDb {
  return (db as unknown as { db: SqlJsDb }).db;
}

function insertSession(db: TrailDatabase, sessionId: string, repoName: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, repo_name, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId, repoName],
  );
}

function insertSessionCommit(db: TrailDatabase, sessionId: string, hash: string, at: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at) VALUES (?, ?, 'msg', ?)`,
    [sessionId, hash, at],
  );
}

function insertCommitFile(db: TrailDatabase, hash: string, filePath: string): void {
  inner(db).run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
}

describe('TrailDatabase.getCommitFilesChurnSince', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('コミットが 0 件のときは空マップを返す', () => {
    const result = db.getCommitFilesChurnSince('repo', '2020-01-01T00:00:00.000Z');
    expect(result.size).toBe(0);
  });

  it('同一ファイルへの 3 コミットを churn=3 としてカウントする', () => {
    const since = '2026-01-01T00:00:00.000Z';
    insertSession(db, 's1', 'repo');
    insertSessionCommit(db, 's1', 'h1', '2026-02-01T00:00:00.000Z');
    insertSessionCommit(db, 's1', 'h2', '2026-03-01T00:00:00.000Z');
    insertSessionCommit(db, 's1', 'h3', '2026-04-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h2', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h3', 'packages/core/src/foo.ts');

    const result = db.getCommitFilesChurnSince('repo', since);
    expect(result.get('packages/core/src/foo.ts')).toBe(3);
  });

  it('since より古いコミットはカウントしない', () => {
    const since = '2026-03-01T00:00:00.000Z';
    insertSession(db, 's1', 'repo');
    insertSessionCommit(db, 's1', 'h1', '2026-01-01T00:00:00.000Z'); // 古い
    insertSessionCommit(db, 's1', 'h2', '2026-04-01T00:00:00.000Z'); // 新しい
    insertCommitFile(db, 'h1', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h2', 'packages/core/src/foo.ts');

    const result = db.getCommitFilesChurnSince('repo', since);
    expect(result.get('packages/core/src/foo.ts')).toBe(1);
  });

  it('別リポジトリのコミットはカウントしない', () => {
    const since = '2026-01-01T00:00:00.000Z';
    insertSession(db, 's1', 'repo-a');
    insertSession(db, 's2', 'repo-b');
    insertSessionCommit(db, 's1', 'h1', '2026-02-01T00:00:00.000Z');
    insertSessionCommit(db, 's2', 'h2', '2026-02-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h2', 'packages/core/src/foo.ts');

    const result = db.getCommitFilesChurnSince('repo-a', since);
    expect(result.get('packages/core/src/foo.ts')).toBe(1);
  });

  it('1 コミットに複数ファイルがある場合、各ファイルを独立してカウントする', () => {
    const since = '2026-01-01T00:00:00.000Z';
    insertSession(db, 's1', 'repo');
    insertSessionCommit(db, 's1', 'h1', '2026-02-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h1', 'packages/core/src/bar.ts');

    const result = db.getCommitFilesChurnSince('repo', since);
    expect(result.get('packages/core/src/foo.ts')).toBe(1);
    expect(result.get('packages/core/src/bar.ts')).toBe(1);
  });
});
