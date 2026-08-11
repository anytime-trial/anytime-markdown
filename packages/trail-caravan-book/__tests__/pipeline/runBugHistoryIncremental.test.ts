import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openCaravanBookDb } from '../../src/db/connection';
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
  const { db, close } = await openCaravanBookDb(tmpPath);

  const trailHandle = BetterSqlite3CaravanDb.openInCaravan();
  // Phase H-4: trail.activity_session_commits / activity_commit_files から repo_name 列を撤去した。repo 帰属は repo_id で
  // 表現し、消費側 (runBugHistoryIncremental / linkAffectedFiles) は trail.activity_repos を JOIN して解決する。
  trailHandle.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  const repoIdOf = (name: string): number => {
    trailHandle.run(
      `INSERT OR IGNORE INTO activity_repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z')`,
      [name]
    );
    const r = trailHandle.exec('SELECT repo_id FROM activity_repos WHERE repo_name = ?', [name]);
    return Number(r[0]?.values?.[0]?.[0] ?? 0);
  };
  trailHandle.run(`CREATE TABLE activity_session_commits (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    repo_id INTEGER NOT NULL DEFAULT 0,
    committed_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    author TEXT NOT NULL DEFAULT 'test',
    session_id TEXT
  ) STRICT`);
  trailHandle.run(`CREATE TABLE activity_commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    repo_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'M'
  ) STRICT`);

  for (const c of commits) {
    trailHandle.run(
      `INSERT INTO activity_session_commits (commit_hash, commit_message, repo_id, committed_at, session_id)
       VALUES (?, ?, ?, ?, ?)`,
      [c.commit_hash, c.commit_message, repoIdOf(c.repo_name), c.committed_at, c.session_id ?? null]
    );
  }
  for (const f of files) {
    trailHandle.run(
      `INSERT INTO activity_commit_files (commit_hash, repo_id, file_path) VALUES (?, ?, ?)`,
      [f.commit_hash, repoIdOf(f.repo_name), f.file_path]
    );
  }

  attachTrailDbFromHandle(db, trailHandle);

  return {
    db,
    close: () => {
      trailHandle.close();
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
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

    const bugFixes = db.exec('SELECT COUNT(*) FROM caravan_bug_fixes');
    expect(bugFixes[0].values[0][0]).toBe(3);

    const bugEntities = db.exec(`SELECT COUNT(*) FROM caravan_entities WHERE type='Bug'`);
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

    const bugCount = db.exec(`SELECT COUNT(*) FROM caravan_entities WHERE type='Bug'`);
    expect(bugCount[0].values[0][0]).toBe(1);

    const affectCount = db.exec(`SELECT COUNT(*) FROM caravan_edges WHERE predicate='affects'`);
    expect(affectCount[0].values[0][0]).toBe(0);

    close();
  }, 30000);

  test('commit body is persisted to body_excerpt (trailer removed)', async () => {
    const commits: TrailCommit[] = [
      {
        commit_hash: 'fix_body_aabb112233',
        commit_message:
          'fix(web-app/logic): wrong calc\n\n原因は丸め誤差。採った方針: 整数演算へ変更。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
        committed_at: '2026-05-01T00:00:00.000Z',
        repo_name: REPO,
      },
    ];

    const { db, close } = await openTestDb(commits, []);

    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    const rows = db.exec(`SELECT body_excerpt FROM caravan_bug_fixes WHERE commit_sha = 'fix_body_aabb112233'`);
    expect(rows[0].values[0][0]).toBe('原因は丸め誤差。採った方針: 整数演算へ変更。');

    close();
  }, 30000);

  test('episodes arriving after ingest are relinked on the next run (even with no new commits)', async () => {
    const commits: TrailCommit[] = [
      {
        commit_hash: 'fix_relink_aabb1122',
        commit_message: 'fix(web-app): broken',
        committed_at: '2026-06-10T00:00:00.000Z',
        repo_name: REPO,
        session_id: 'sess_late',
      },
    ];

    const { db, close } = await openTestDb(commits, []);

    // 1 回目: episode 不在なので root_cause_episode_id は NULL
    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });
    const before = db.exec(`SELECT root_cause_episode_id FROM caravan_bug_fixes WHERE commit_sha = 'fix_relink_aabb1122'`);
    expect(before[0].values[0][0]).toBeNull();

    // episode が後から取込まれる（会話取込ラグの再現）
    db.run(
      `INSERT INTO caravan_episodes
         (id, session_id, message_uuid_start, message_uuid_end,
          agent_runtime, model, valid_from, recorded_at, raw_excerpt)
       VALUES ('ep_late', 'sess_late', 'm1', 'm2', 'claude_code', 'test',
               '2026-06-09T00:00:00.000Z', '2026-06-11T00:00:00.000Z', '原因を議論した会話')`
    );

    // 2 回目: 新規コミット 0 件でも再リンクが走る
    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });
    const after = db.exec(`SELECT root_cause_episode_id FROM caravan_bug_fixes WHERE commit_sha = 'fix_relink_aabb1122'`);
    expect(after[0].values[0][0]).toBe('ep_late');

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
