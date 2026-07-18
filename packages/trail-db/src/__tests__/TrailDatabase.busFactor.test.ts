// Phase 6 S5-B: Bus Factor の入力（ファイル×著者×コミット）を返すクエリ。
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function insertSessionCommit(
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  author: string,
  at: string,
): void {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at, author) VALUES (?, ?, '', ?, ?)`,
    [sessionId, hash, at, author],
  );
}

function insertCommitFile(db: TrailDatabase, hash: string, filePath: string): void {
  (db as unknown as { db: SqlJsDb }).db.run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
}

const RECENT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

describe('TrailDatabase.fetchFileAuthorCommits', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => {
    db.close();
  });

  it('データが無ければ空配列', () => {
    expect(db.fetchFileAuthorCommits({})).toEqual([]);
  });

  it('ファイル×著者×コミットを返す', () => {
    insertSessionCommit(db, 's1', 'h1', 'Taro', RECENT);
    insertCommitFile(db, 'h1', 'packages/trail-core/src/a.ts');
    insertCommitFile(db, 'h1', 'packages/trail-core/src/b.ts');

    const rows = db.fetchFileAuthorCommits({});
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.author === 'Taro' && r.commitHash === 'h1')).toBe(true);
    expect(rows.map((r) => r.filePath).sort()).toEqual([
      'packages/trail-core/src/a.ts',
      'packages/trail-core/src/b.ts',
    ]);
  });

  it('著者が空のコミットは除外する', () => {
    insertSessionCommit(db, 's1', 'h1', '', RECENT);
    insertCommitFile(db, 'h1', 'packages/trail-core/src/a.ts');
    expect(db.fetchFileAuthorCommits({})).toEqual([]);
  });

  it('sinceIso より前のコミットは除外する', () => {
    insertSessionCommit(db, 's1', 'h-old', 'Taro', '2020-01-01T00:00:00.000Z');
    insertCommitFile(db, 'h-old', 'packages/trail-core/src/a.ts');
    insertSessionCommit(db, 's2', 'h-new', 'Taro', RECENT);
    insertCommitFile(db, 'h-new', 'packages/trail-core/src/a.ts');

    const rows = db.fetchFileAuthorCommits({ sinceIso: '2026-01-01T00:00:00.000Z' });
    expect(rows).toHaveLength(1);
    expect(rows[0].commitHash).toBe('h-new');
  });

  it('同一コミットが複数セッションに紐づくと重複行で返る（一意化は算出側の責務）', () => {
    insertSessionCommit(db, 's1', 'h1', 'Taro', RECENT);
    insertSessionCommit(db, 's2', 'h1', 'Taro', RECENT);
    insertCommitFile(db, 'h1', 'packages/trail-core/src/a.ts');

    const rows = db.fetchFileAuthorCommits({});
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.commitHash)).size).toBe(1);
  });
});
