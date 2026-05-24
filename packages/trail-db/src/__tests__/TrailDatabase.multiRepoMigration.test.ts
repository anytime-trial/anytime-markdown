
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;
const repoIdFor = (db: TrailDatabase, name: string): number =>
  (db as unknown as { repoIdForName(n: string): number }).repoIdForName(name);

// Phase H-4: sessions / session_commits / commit_files から repo_name 列を物理撤去した。
// repo 帰属は repo_id で表現し、repo_name が必要な read は repos を (LEFT) JOIN して復元する。
const insertSession = (db: TrailDatabase, sessionId: string, repoName: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, ?, '0', '', '', '2026-04-29T00:00:00.000Z', '', 0, '', 0, '')`,
    [sessionId, sessionId, repoIdFor(db, repoName)],
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
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id)
     VALUES (?, ?, '', '', '2026-04-29T00:00:00.000Z', 0, 0, 0, 0, ?)`,
    [sessionId, commitHash, repoIdFor(db, repoName)],
  );
};

const insertCommitFile = (
  db: TrailDatabase,
  commitHash: string,
  filePath: string,
  repoName: string,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id)
     VALUES (?, ?, ?)`,
    [commitHash, filePath, repoIdFor(db, repoName)],
  );
};

// repo_name は撤去済のため repo_id 経由で repos から復元する。
const getCommitRepoName = (db: TrailDatabase, sessionId: string, commitHash: string): string => {
  const r = inner(db).exec(
    `SELECT COALESCE(rp.repo_name, '') FROM session_commits sc
       LEFT JOIN repos rp ON rp.repo_id = sc.repo_id
      WHERE sc.session_id = ? AND sc.commit_hash = ?`,
    [sessionId, commitHash],
  );
  return String(r[0]?.values[0]?.[0] ?? '');
};

const getCommitFileRepoName = (db: TrailDatabase, commitHash: string, filePath: string): string => {
  const r = inner(db).exec(
    `SELECT COALESCE(rp.repo_name, '') FROM commit_files cf
       LEFT JOIN repos rp ON rp.repo_id = cf.repo_id
      WHERE cf.commit_hash = ? AND cf.file_path = ?`,
    [commitHash, filePath],
  );
  return String(r[0]?.values[0]?.[0] ?? '');
};

const hasMigrationKey = (db: TrailDatabase, key: string): boolean => {
  const r = inner(db).exec('SELECT 1 FROM _migrations WHERE key = ?', [key]);
  return Boolean(r[0]?.values?.length);
};

describe('TrailDatabase migration: repo normalization (Phase H-4)', () => {
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

  it('Phase H-4: session_commits / commit_files から repo_name 列が撤去され repo_id を持つ', () => {
    const cols = inner(db).exec('PRAGMA table_info(session_commits)')[0]?.values ?? [];
    const colNames = cols.map((r) => String(r[1]));
    expect(colNames).not.toContain('repo_name');
    expect(colNames).toContain('repo_id');

    const fileCols = inner(db).exec('PRAGMA table_info(commit_files)')[0]?.values ?? [];
    const fileColNames = fileCols.map((r) => String(r[1]));
    expect(fileColNames).not.toContain('repo_name');
    expect(fileColNames).toContain('repo_id');
  });

  it('session_commit_resolutions table exists with repo_id composite PK (repo_name 撤去済)', () => {
    const cols = inner(db).exec('PRAGMA table_info(session_commit_resolutions)')[0]?.values ?? [];
    const colNames = cols.map((r) => String(r[1]));
    // Phase H-4: repo_name は撤去され、PK は (session_id, repo_id)。
    expect(colNames).toEqual(expect.arrayContaining(['session_id', 'repo_id', 'resolved_at']));
    expect(colNames).not.toContain('repo_name');

    const pkCols = cols.filter((r) => Number(r[5]) > 0).map((r) => String(r[1]));
    expect(pkCols.sort()).toEqual(['repo_id', 'session_id']);
  });

  it('repo 帰属が repo_id 経由で session_commits に保存され、repos JOIN で repo_name を復元できる', () => {
    insertSession(db, 'sess-1', 'anytime-markdown');
    insertCommit(db, 'sess-1', 'hash-a', 'anytime-markdown');

    expect(getCommitRepoName(db, 'sess-1', 'hash-a')).toBe('anytime-markdown');
    // session_commits.repo_id は repos.repo_name='anytime-markdown' に対応する。
    const expected = repoIdFor(db, 'anytime-markdown');
    const r = inner(db).exec(
      "SELECT repo_id FROM session_commits WHERE session_id = 'sess-1' AND commit_hash = 'hash-a'",
    );
    expect(Number(r[0]?.values[0]?.[0])).toBe(expected);
  });

  it('repo 帰属が repo_id 経由で commit_files に保存され、repos JOIN で repo_name を復元できる', () => {
    insertSession(db, 'sess-2', 'anytime-markdown');
    insertCommit(db, 'sess-2', 'hash-b', 'anytime-markdown');
    insertCommitFile(db, 'hash-b', 'src/foo.ts', 'anytime-markdown');

    expect(getCommitFileRepoName(db, 'hash-b', 'src/foo.ts')).toBe('anytime-markdown');
  });

  it('backfillRepoName_v1 は Phase H-4 で superseded され、no-op で done を記録する', () => {
    insertSession(db, 'sess-4', 'anytime-markdown');
    insertCommit(db, 'sess-4', 'hash-d', 'anytime-markdown');

    // repo_name 列は撤去済のため backfill は何もせず done だけ記録する (例外を投げない)。
    expect(() => {
      (db as unknown as { backfillRepoName_v1: () => void }).backfillRepoName_v1();
    }).not.toThrow();
    expect(hasMigrationKey(db, 'repo_name_backfill_v1')).toBe(true);
    // repo 帰属は repo_id のまま維持される。
    expect(getCommitRepoName(db, 'sess-4', 'hash-d')).toBe('anytime-markdown');
  });
});
