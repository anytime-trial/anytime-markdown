// __non_webpack_require__ のモック（全テストファイルで必要）
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

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

describe('TrailDatabase.getCommitFilesEverChurned', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('コミットが 0 件のときは空 Set を返す', () => {
    const result = db.getCommitFilesEverChurned('repo');
    expect(result).toEqual(new Set());
  });

  it('期間制約なしで全期間の commit 履歴を返す', () => {
    insertSession(db, 's1', 'repo');
    insertSessionCommit(db, 's1', 'h-old', '2024-01-01T00:00:00.000Z'); // 90 日より前
    insertSessionCommit(db, 's1', 'h-new', '2026-05-01T00:00:00.000Z'); // 直近
    insertCommitFile(db, 'h-old', 'packages/core/src/old-only.ts');
    insertCommitFile(db, 'h-new', 'packages/core/src/recent-only.ts');

    const result = db.getCommitFilesEverChurned('repo');
    expect(result).toEqual(new Set([
      'packages/core/src/old-only.ts',
      'packages/core/src/recent-only.ts',
    ]));
  });

  it('別リポジトリのコミットは含めない', () => {
    insertSession(db, 's1', 'repo-a');
    insertSession(db, 's2', 'repo-b');
    insertSessionCommit(db, 's1', 'h1', '2026-02-01T00:00:00.000Z');
    insertSessionCommit(db, 's2', 'h2', '2026-02-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/a/foo.ts');
    insertCommitFile(db, 'h2', 'packages/b/bar.ts');

    const result = db.getCommitFilesEverChurned('repo-a');
    expect(result.has('packages/a/foo.ts')).toBe(true);
    expect(result.has('packages/b/bar.ts')).toBe(false);
  });

  it('同一ファイルが複数 commit に登場しても Set 上は 1 件のみ', () => {
    insertSession(db, 's1', 'repo');
    insertSessionCommit(db, 's1', 'h1', '2026-02-01T00:00:00.000Z');
    insertSessionCommit(db, 's1', 'h2', '2026-03-01T00:00:00.000Z');
    insertSessionCommit(db, 's1', 'h3', '2026-04-01T00:00:00.000Z');
    insertCommitFile(db, 'h1', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h2', 'packages/core/src/foo.ts');
    insertCommitFile(db, 'h3', 'packages/core/src/foo.ts');

    const result = db.getCommitFilesEverChurned('repo');
    expect(result.size).toBe(1);
    expect(result.has('packages/core/src/foo.ts')).toBe(true);
  });
});
