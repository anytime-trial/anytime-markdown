import initSqlJs from 'sql.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runBugHistoryIncremental } from '../../src/pipeline/runBugHistoryIncremental';
import { noopLogger } from '../../src/logger';

function makeTmpPath() {
  return path.join(os.tmpdir(), `rbi-test-${process.pid}-${Date.now()}.db`);
}

interface TrailCommit {
  commit_hash: string;
  commit_message: string;
  committed_at: string;
  repo_name: string;
  session_id?: string | null;
}

interface TrailFile {
  commit_hash: string;
  repo_name: string;
  file_path: string;
}

async function openTestDb(commits: TrailCommit[], files: TrailFile[]) {
  const tmpPath = makeTmpPath();
  process.env.MEMORY_CORE_DB_PATH = tmpPath;
  const { db, close } = await openMemoryCoreDb();

  const SQL = await initSqlJs();
  const trailHandle = new SQL.Database();
  trailHandle.run(`CREATE TABLE session_commits (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    repo_name TEXT NOT NULL DEFAULT 'repo',
    committed_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    author TEXT NOT NULL DEFAULT 'test',
    session_id TEXT
  ) STRICT`);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'M'
  ) STRICT`);

  for (const c of commits) {
    trailHandle.run(
      `INSERT INTO session_commits (commit_hash, commit_message, repo_name, committed_at, session_id)
       VALUES (?, ?, ?, ?, ?)`,
      [c.commit_hash, c.commit_message, c.repo_name, c.committed_at, c.session_id ?? null]
    );
  }
  for (const f of files) {
    trailHandle.run(
      `INSERT INTO commit_files (commit_hash, repo_name, file_path) VALUES (?, ?, ?)`,
      [f.commit_hash, f.repo_name, f.file_path]
    );
  }

  attachTrailDbFromHandle(db, trailHandle);

  return {
    db,
    close: () => {
      trailHandle.close();
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

const REPO = 'test-repo';
const REPOROOT = '/tmp';

describe('runBugHistoryIncremental', () => {
  test('3 fix commits + 2 non-fix → bugs_inserted=3, edges>=6', async () => {
    const commits: TrailCommit[] = [
      { commit_hash: 'fix001aabbccdd1122', commit_message: 'fix(web-app/regression): login broken', committed_at: '2026-01-01T00:00:00.000Z', repo_name: REPO },
      { commit_hash: 'fix002aabbccdd1122', commit_message: 'fix(web-app/logic): wrong calc', committed_at: '2026-01-02T00:00:00.000Z', repo_name: REPO },
      { commit_hash: 'fix003aabbccdd1122', commit_message: 'fix: typo in README', committed_at: '2026-01-03T00:00:00.000Z', repo_name: REPO },
      { commit_hash: 'feat001aabbccdd112', commit_message: 'feat: add dark mode', committed_at: '2026-01-04T00:00:00.000Z', repo_name: REPO },
      { commit_hash: 'chore001aabbccdd11', commit_message: 'chore: update deps', committed_at: '2026-01-05T00:00:00.000Z', repo_name: REPO },
    ];
    const files: TrailFile[] = [
      { commit_hash: 'fix001aabbccdd1122', repo_name: REPO, file_path: 'packages/web-app/src/login.ts' },
      { commit_hash: 'fix001aabbccdd1122', repo_name: REPO, file_path: 'packages/web-app/src/auth.ts' },
      { commit_hash: 'fix002aabbccdd1122', repo_name: REPO, file_path: 'packages/web-app/src/calc.ts' },
      // fix003 has no files
    ];

    const { db, close } = await openTestDb(commits, files);

    const result = await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(3);
    expect(result.bugs_inserted).toBe(3);
    // fixes edges = 3, affects edges = 2+1+0 = 3 → minimum 6
    expect(result.edges_inserted).toBeGreaterThanOrEqual(6);

    const bugFixes = db.exec('SELECT COUNT(*) FROM memory_bug_fixes');
    expect(bugFixes[0].values[0][0]).toBe(3);

    const bugEntities = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type='Bug'`);
    expect(bugEntities[0].values[0][0]).toBe(3);

    close();
  }, 30000);

  test('2nd call → items_processed=0 (last_processed_at updated)', async () => {
    const commits: TrailCommit[] = [
      { commit_hash: 'fix_idem_001aabb11', commit_message: 'fix(web-app): broken', committed_at: '2026-02-01T00:00:00.000Z', repo_name: REPO },
    ];

    const { db, close } = await openTestDb(commits, []);

    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });
    const second = await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    expect(second.items_processed).toBe(0);
    expect(second.bugs_inserted).toBe(0);
    expect(second.status).toBe('success');

    close();
  }, 30000);

  test('fix commit with no files → Bug entity created, affects=0', async () => {
    const commits: TrailCommit[] = [
      { commit_hash: 'fix_nofiles_aabb1122', commit_message: 'fix: docs only', committed_at: '2026-03-01T00:00:00.000Z', repo_name: REPO },
    ];

    const { db, close } = await openTestDb(commits, []);

    const result = await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    expect(result.bugs_inserted).toBe(1);

    const bugCount = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type='Bug'`);
    expect(bugCount[0].values[0][0]).toBe(1);

    const affectCount = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE predicate='affects'`);
    expect(affectCount[0].values[0][0]).toBe(0);

    close();
  }, 30000);

  test('non-fix commits only → items_processed=0, status=success', async () => {
    const commits: TrailCommit[] = [
      { commit_hash: 'feat_only_aabb11223', commit_message: 'feat: new feature', committed_at: '2026-04-01T00:00:00.000Z', repo_name: REPO },
      { commit_hash: 'chore_only_aabb1122', commit_message: 'chore: cleanup', committed_at: '2026-04-02T00:00:00.000Z', repo_name: REPO },
    ];

    const { db, close } = await openTestDb(commits, []);

    const result = await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    expect(result.items_processed).toBe(0);
    expect(result.bugs_inserted).toBe(0);
    expect(result.status).toBe('success');

    close();
  }, 30000);
});
