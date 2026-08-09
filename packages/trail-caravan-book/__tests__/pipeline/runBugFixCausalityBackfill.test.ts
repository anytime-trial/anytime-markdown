import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openCaravanBookDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runBugHistoryIncremental } from '../../src/pipeline/runBugHistoryIncremental';
import { runBugFixCausalityBackfill } from '../../src/pipeline/runBugFixCausalityBackfill';
import { noopLogger } from '../../src/logger';

const REPO = 'test-repo';
const REPOROOT = '/tmp';

function makeTmpPath() {
  return path.join(os.tmpdir(), `rbcb-test-${process.pid}-${Date.now()}.db`);
}

async function openTestDb(commits: Array<{ sha: string; message: string; at: string; session?: string }>) {
  const tmpPath = makeTmpPath();
  const { db, close } = await openCaravanBookDb(tmpPath);

  const trailHandle = BetterSqlite3CaravanDb.openInCaravan();
  trailHandle.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(
    `INSERT INTO activity_repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z')`,
    [REPO]
  );
  trailHandle.run(`CREATE TABLE activity_session_commits (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    repo_id INTEGER NOT NULL DEFAULT 1,
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
       VALUES (?, ?, 1, ?, ?)`,
      [c.sha, c.message, c.at, c.session ?? null]
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

describe('runBugFixCausalityBackfill', () => {
  test('fills body_excerpt for legacy rows and relinks late episodes; idempotent on rerun', async () => {
    const { db, close } = await openTestDb([
      {
        sha: 'fix_bf_body_aabb11',
        message: 'fix(web-app/logic): calc\n\nwhy: 丸め誤差のため。',
        at: '2026-06-01T00:00:00.000Z',
        session: 'sess_bf',
      },
      {
        sha: 'fix_bf_nobody_aabb',
        message: 'fix(web-app/spec): subject only',
        at: '2026-06-02T00:00:00.000Z',
      },
    ]);

    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });

    // 旧実装で取り込まれた状態（body_excerpt 未充填・episode 未リンク）を再現する
    db.run(`UPDATE caravan_bug_fixes SET body_excerpt = '', root_cause_episode_id = NULL`);
    db.run(
      `INSERT INTO caravan_episodes
         (id, session_id, message_uuid_start, message_uuid_end,
          agent_runtime, model, valid_from, recorded_at, raw_excerpt)
       VALUES ('ep_bf', 'sess_bf', 'm1', 'm2', 'claude_code', 'test',
               '2026-05-31T00:00:00.000Z', '2026-06-03T00:00:00.000Z', '原因の議論')`
    );

    const result = runBugFixCausalityBackfill({
      db, repoName: REPO, repoRoot: REPOROOT, inferIntroduced: false, logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.body_filled).toBe(1); // 本文なしコミットは充填されない
    expect(result.episodes_relinked).toBe(1);

    const body = db.exec(`SELECT body_excerpt FROM caravan_bug_fixes WHERE commit_sha = 'fix_bf_body_aabb11'`);
    expect(body[0].values[0][0]).toBe('why: 丸め誤差のため。');
    const ep = db.exec(`SELECT root_cause_episode_id FROM caravan_bug_fixes WHERE commit_sha = 'fix_bf_body_aabb11'`);
    expect(ep[0].values[0][0]).toBe('ep_bf');

    // 再実行は 0 件更新に収束する（冪等）
    const second = runBugFixCausalityBackfill({
      db, repoName: REPO, repoRoot: REPOROOT, inferIntroduced: false, logger: noopLogger,
    });
    expect(second.body_filled).toBe(0);
    expect(second.episodes_relinked).toBe(0);

    close();
  }, 30000);

  test('introduced inference attempts rows with affected files without throwing on a non-git repoRoot', async () => {
    const { db, close } = await openTestDb([
      { sha: 'fix_bf_intro_aabb1', message: 'fix(web-app/logic): x', at: '2026-06-05T00:00:00.000Z' },
    ]);

    await runBugHistoryIncremental({ db, repoName: REPO, repoRoot: REPOROOT, logger: noopLogger });
    // affected files を持つ行を作る（linkAffectedFiles は trail の files 由来なのでここでは直接埋める）
    db.run(
      `UPDATE caravan_bug_fixes SET affected_file_paths_json = '["packages/web-app/src/x.ts"]'
        WHERE commit_sha = 'fix_bf_intro_aabb1'`
    );

    const result = runBugFixCausalityBackfill({
      db, repoName: REPO, repoRoot: '/nonexistent-not-a-git-repo', logger: noopLogger,
    });

    expect(result.introduced_attempted).toBe(1);
    expect(result.introduced_inferred).toBe(0); // git 不在 → 推定不能で null のまま

    close();
  }, 30000);
});
