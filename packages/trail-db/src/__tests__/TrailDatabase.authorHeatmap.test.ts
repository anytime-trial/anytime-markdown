import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsResult = Array<{ columns: string[]; values: unknown[][] }>;
type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => SqlJsResult;
};
const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;
const repoId = (db: TrailDatabase, name: string): number =>
  (db as unknown as { repoIdForName(n: string): number }).repoIdForName(name);

/** session_commits / commit_files / sessions を最小構成で seed する。 */
function seedCommit(
  db: TrailDatabase,
  args: {
    repo: string;
    sessionId: string;
    commitHash: string;
    filePaths: readonly string[];
    committedAt?: string;
  },
): void {
  const rid = repoId(db, args.repo);
  const sql = inner(db);
  sql.run(`INSERT OR IGNORE INTO sessions (id, repo_id) VALUES (?, ?)`, [args.sessionId, rid]);
  sql.run(
    `INSERT OR REPLACE INTO session_commits (session_id, repo_id, commit_hash, committed_at, author)
     VALUES (?, ?, ?, ?, ?)`,
    [args.sessionId, rid, args.commitHash, args.committedAt ?? '2026-01-01T00:00:00.000Z', 'ueda'],
  );
  for (const filePath of args.filePaths) {
    sql.run(
      `INSERT OR REPLACE INTO commit_files (repo_id, commit_hash, file_path) VALUES (?, ?, ?)`,
      [rid, args.commitHash, filePath],
    );
  }
}

describe('TrailDatabase.fetchFileSessionCommits', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('新規 DB では空配列を返す', () => {
    expect(db.fetchFileSessionCommits({})).toEqual([]);
  });

  it('ファイル×セッション×コミットの行を返す', () => {
    seedCommit(db, {
      repo: 'repo-a',
      sessionId: 's1',
      commitHash: 'c1',
      filePaths: ['a.ts', 'b.ts'],
      committedAt: '2026-02-03T04:05:06.000Z',
    });

    const rows = db.fetchFileSessionCommits({ repo: 'repo-a' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.filePath).sort()).toEqual(['a.ts', 'b.ts']);
    expect(rows[0].sessionId).toBe('s1');
    expect(rows[0].commitHash).toBe('c1');
    expect(rows[0].committedAt).toBe('2026-02-03T04:05:06.000Z');
  });

  it('repo 指定時に他リポの行が混ざらない（同一 commit_hash が両リポに在っても）', () => {
    seedCommit(db, { repo: 'repo-a', sessionId: 's1', commitHash: 'shared', filePaths: ['a.ts'] });
    seedCommit(db, { repo: 'repo-b', sessionId: 's2', commitHash: 'shared', filePaths: ['b.ts'] });

    const rowsA = db.fetchFileSessionCommits({ repo: 'repo-a' });
    expect(rowsA.map((r) => r.filePath)).toEqual(['a.ts']);

    const rowsB = db.fetchFileSessionCommits({ repo: 'repo-b' });
    expect(rowsB.map((r) => r.filePath)).toEqual(['b.ts']);
  });

  it('repo 未指定なら全リポの行を返す', () => {
    seedCommit(db, { repo: 'repo-a', sessionId: 's1', commitHash: 'c1', filePaths: ['a.ts'] });
    seedCommit(db, { repo: 'repo-b', sessionId: 's2', commitHash: 'c2', filePaths: ['b.ts'] });

    expect(db.fetchFileSessionCommits({}).map((r) => r.filePath).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('未登録の repo 名では空配列を返す（例外にしない）', () => {
    seedCommit(db, { repo: 'repo-a', sessionId: 's1', commitHash: 'c1', filePaths: ['a.ts'] });
    expect(db.fetchFileSessionCommits({ repo: 'no-such-repo' })).toEqual([]);
  });

  it('同一コミットが複数セッションに紐づく行を重複したまま返す（一意化は算出側の責務）', () => {
    seedCommit(db, { repo: 'repo-a', sessionId: 's1', commitHash: 'c1', filePaths: ['a.ts'] });
    seedCommit(db, { repo: 'repo-a', sessionId: 's2', commitHash: 'c1', filePaths: ['a.ts'] });

    const rows = db.fetchFileSessionCommits({ repo: 'repo-a' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sessionId).sort()).toEqual(['s1', 's2']);
  });
});
