
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSession = (db: TrailDatabase, sessionId: string, repoName: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, ?, '0', '', '', '2026-04-29T00:00:00.000Z', '', 0, '', 0, '')`,
    [sessionId, sessionId, repoName],
  );
};

const insertCommit = (
  db: TrailDatabase,
  sessionId: string,
  commitHash: string,
  repoName: string,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits
       (session_id, commit_hash, commit_message, author, committed_at,
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_name)
     VALUES (?, ?, '', '', '2026-04-29T00:00:00.000Z', 0, 0, 0, 0, ?)`,
    [sessionId, commitHash, repoName],
  );
};

const insertCommitFile = (
  db: TrailDatabase,
  commitHash: string,
  filePath: string,
  repoName: string,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_name)
     VALUES (?, ?, ?)`,
    [commitHash, filePath, repoName],
  );
};

const getCommitRepoName = (db: TrailDatabase, sessionId: string, commitHash: string): string => {
  const r = inner(db).exec(
    'SELECT repo_name FROM session_commits WHERE session_id = ? AND commit_hash = ?',
    [sessionId, commitHash],
  );
  return String(r[0]?.values[0]?.[0] ?? '');
};

const getCommitFileRepoName = (db: TrailDatabase, commitHash: string, filePath: string): string => {
  const r = inner(db).exec(
    'SELECT repo_name FROM commit_files WHERE commit_hash = ? AND file_path = ?',
    [commitHash, filePath],
  );
  return String(r[0]?.values[0]?.[0] ?? '');
};

const hasMigrationKey = (db: TrailDatabase, key: string): boolean => {
  const r = inner(db).exec('SELECT 1 FROM _migrations WHERE key = ?', [key]);
  return Boolean(r[0]?.values?.length);
};

describe('TrailDatabase migration: repo_name', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    // createTables() の流れで backfillRepoName_v1 が走った場合の片付け
    inner(db).run("DELETE FROM _migrations WHERE key = 'repo_name_backfill_v1'");
    // テストデータをクリーンに保つ
    inner(db).run("DELETE FROM commit_files");
    inner(db).run("DELETE FROM session_commits");
    inner(db).run("DELETE FROM sessions");
  });

  afterEach(() => {
    db.close();
  });

  it('schema includes repo_name columns on session_commits and commit_files', () => {
    const cols = inner(db).exec('PRAGMA table_info(session_commits)')[0]?.values ?? [];
    const colNames = cols.map((r) => String(r[1]));
    expect(colNames).toContain('repo_name');

    const fileCols = inner(db).exec('PRAGMA table_info(commit_files)')[0]?.values ?? [];
    const fileColNames = fileCols.map((r) => String(r[1]));
    expect(fileColNames).toContain('repo_name');
  });

  it('session_commit_resolutions table exists with composite PK', () => {
    const cols = inner(db).exec('PRAGMA table_info(session_commit_resolutions)')[0]?.values ?? [];
    const colNames = cols.map((r) => String(r[1]));
    expect(colNames).toEqual(expect.arrayContaining(['session_id', 'repo_name', 'resolved_at']));

    const pkCols = cols.filter((r) => Number(r[5]) > 0).map((r) => String(r[1]));
    expect(pkCols.sort()).toEqual(['repo_name', 'session_id']);
  });

  it('backfill: empty repo_name in session_commits is filled from sessions.repo_name', () => {
    insertSession(db, 'sess-1', 'anytime-markdown');
    insertCommit(db, 'sess-1', 'hash-a', '');

    expect(getCommitRepoName(db, 'sess-1', 'hash-a')).toBe('');

    (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();

    expect(getCommitRepoName(db, 'sess-1', 'hash-a')).toBe('anytime-markdown');
    expect(hasMigrationKey(db, 'repo_name_backfill_v1')).toBe(true);
  });

  it('backfill: commit_files rows are populated via session_commits join', () => {
    insertSession(db, 'sess-2', 'anytime-markdown');
    insertCommit(db, 'sess-2', 'hash-b', '');
    insertCommitFile(db, 'hash-b', 'src/foo.ts', '');

    (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();

    expect(getCommitFileRepoName(db, 'hash-b', 'src/foo.ts')).toBe('anytime-markdown');
  });

  it('idempotent: re-running backfill does not overwrite existing non-empty repo_name', () => {
    insertSession(db, 'sess-3', 'anytime-markdown');
    insertCommit(db, 'sess-3', 'hash-c', 'manually-set');

    (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();

    expect(getCommitRepoName(db, 'sess-3', 'hash-c')).toBe('manually-set');
  });

  it('does not double-run after recording the migration flag', () => {
    insertSession(db, 'sess-4', 'anytime-markdown');
    insertCommit(db, 'sess-4', 'hash-d', '');

    (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();
    expect(getCommitRepoName(db, 'sess-4', 'hash-d')).toBe('anytime-markdown');

    // 紐付け先 session の repo_name を変更しても、二度目の backfill は走らない
    inner(db).run("UPDATE sessions SET repo_name = 'changed' WHERE id = 'sess-4'");
    inner(db).run("UPDATE session_commits SET repo_name = '' WHERE session_id = 'sess-4'");

    (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();
    // フラグ済みなので backfill されず空のまま
    expect(getCommitRepoName(db, 'sess-4', 'hash-d')).toBe('');
  });
});
