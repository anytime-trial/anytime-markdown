
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSession = (db: TrailDatabase, sessionId: string, startTime: string, endTime: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', ?, ?, 0, '', 0, '')`,
    [sessionId, sessionId, startTime, endTime],
  );
};

const initGitRepo = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
  const opts = { cwd: dir, encoding: 'utf-8' as const };
  execFileSync('git', ['init', '-q', '-b', 'main'], opts);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], opts);
  execFileSync('git', ['config', 'user.name', 'Test'], opts);
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], opts);
};

const commitWithMessage = (
  dir: string,
  fileName: string,
  fileContent: string,
  message: string,
  date?: string,
): string => {
  fs.writeFileSync(path.join(dir, fileName), fileContent);
  const env = date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env;
  const opts = { cwd: dir, encoding: 'utf-8' as const, env };
  execFileSync('git', ['add', fileName], opts);
  execFileSync('git', ['commit', '-q', '-m', message], opts);
  const hash = execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
  return hash;
};

// Phase H-4: session_commits / session_commit_resolutions から repo_name 列を撤去した。
// repo 名は repo_id 経由で repos から復元する。
const getCommitRows = (
  db: TrailDatabase,
  sessionId: string,
): Array<{ commit_hash: string; repo_name: string }> => {
  const r = inner(db).exec(
    `SELECT sc.commit_hash, COALESCE(rp.repo_name, '') AS repo_name
       FROM session_commits sc LEFT JOIN repos rp ON rp.repo_id = sc.repo_id
      WHERE sc.session_id = ? ORDER BY sc.commit_hash`,
    [sessionId],
  );
  const values = r[0]?.values ?? [];
  return values.map((row) => ({
    commit_hash: String(row[0] ?? ''),
    repo_name: String(row[1] ?? ''),
  }));
};

const getResolutionRows = (
  db: TrailDatabase,
  sessionId: string,
): Array<{ repo_name: string; resolved_at: string }> => {
  const r = inner(db).exec(
    `SELECT COALESCE(rp.repo_name, '') AS repo_name, scr.resolved_at
       FROM session_commit_resolutions scr LEFT JOIN repos rp ON rp.repo_id = scr.repo_id
      WHERE scr.session_id = ? ORDER BY rp.repo_name`,
    [sessionId],
  );
  const values = r[0]?.values ?? [];
  return values.map((row) => ({
    repo_name: String(row[0] ?? ''),
    resolved_at: String(row[1] ?? ''),
  }));
};

describe('TrailDatabase.resolveCommits multi-repo', () => {
  let db: TrailDatabase;
  let tmpRoot: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-multirepo-'));
  });

  afterEach(() => {
    db.close();
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('populates repo_name on session_commits when called with repoName', () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const startTime = '2026-04-29T00:00:00.000Z';
    const endTime = '2026-04-29T01:00:00.000Z';
    insertSession(db, sessionId, startTime, endTime);

    const repoDir = path.join(tmpRoot, 'repo-a');
    initGitRepo(repoDir);
    const hash = commitWithMessage(
      repoDir,
      'a.txt',
      'hello',
      `feat: hello\n\nSession-Id: ${sessionId}`,
      '2026-04-29T00:30:00+00:00',
    );

    const count = (db as unknown as {
      resolveCommits: (sid: string, gitRoot: string, repoName: string) => number;
    }).resolveCommits(sessionId, repoDir, 'repo-a');

    expect(count).toBeGreaterThan(0);
    const rows = getCommitRows(db, sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ commit_hash: hash, repo_name: 'repo-a' });
  });

  it('returns repo_name with commit files for remote sync', () => {
    // Phase H-4: commit_files.repo_name 列は撤去済。repo 帰属は repo_id で保存し、getCommitFiles は
    // repos を JOIN して repo_name を復元する (Supabase ミラーへ運ぶ契約)。
    const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    inner(db).run(
      `INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES ('hash-a', 'a.txt', ?)`,
      [repoId],
    );

    expect(db.getCommitFiles(['hash-a'])).toEqual([
      { repo_id: repoId, repo_name: 'repo-a', commit_hash: 'hash-a', file_path: 'a.txt' },
    ]);
  });

  it('writes session_commit_resolutions for the resolved (session, repo) pair', () => {
    const sessionId = '22222222-2222-4222-8222-222222222222';
    insertSession(db, sessionId, '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z');

    const repoDir = path.join(tmpRoot, 'repo-b');
    initGitRepo(repoDir);
    commitWithMessage(repoDir, 'b.txt', 'x', `chore: x\n\nSession-Id: ${sessionId}`, '2026-04-29T00:30:00+00:00');

    (db as unknown as {
      resolveCommits: (sid: string, gitRoot: string, repoName: string) => number;
    }).resolveCommits(sessionId, repoDir, 'repo-b');

    const resolutions = getResolutionRows(db, sessionId);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].repo_name).toBe('repo-b');
    expect(resolutions[0].resolved_at).not.toBe('');
  });

  it('records different repo_name values when same session commits to two repos', () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    insertSession(db, sessionId, '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z');

    const repoA = path.join(tmpRoot, 'repo-x');
    const repoB = path.join(tmpRoot, 'repo-y');
    initGitRepo(repoA);
    initGitRepo(repoB);

    const hashA = commitWithMessage(repoA, 'a.txt', 'a', `feat: a\n\nSession-Id: ${sessionId}`, '2026-04-29T00:15:00+00:00');
    const hashB = commitWithMessage(repoB, 'b.txt', 'b', `feat: b\n\nSession-Id: ${sessionId}`, '2026-04-29T00:45:00+00:00');

    const resolveCommits = (db as unknown as {
      resolveCommits: (sid: string, gitRoot: string, repoName: string) => number;
    }).resolveCommits.bind(db);

    resolveCommits(sessionId, repoA, 'repo-x');
    resolveCommits(sessionId, repoB, 'repo-y');

    const rows = getCommitRows(db, sessionId);
    expect(rows).toHaveLength(2);

    const byRepo = new Map(rows.map((r) => [r.repo_name, r.commit_hash]));
    expect(byRepo.get('repo-x')).toBe(hashA);
    expect(byRepo.get('repo-y')).toBe(hashB);

    const resolutions = getResolutionRows(db, sessionId);
    expect(resolutions.map((r) => r.repo_name)).toEqual(['repo-x', 'repo-y']);
  });

  it('is idempotent: calling resolveCommits twice for same (session, repo) does not duplicate rows', () => {
    const sessionId = '44444444-4444-4444-8444-444444444444';
    insertSession(db, sessionId, '2026-04-29T00:00:00.000Z', '2026-04-29T01:00:00.000Z');

    const repoDir = path.join(tmpRoot, 'repo-c');
    initGitRepo(repoDir);
    commitWithMessage(repoDir, 'c.txt', 'c', `feat: c\n\nSession-Id: ${sessionId}`, '2026-04-29T00:30:00+00:00');

    const resolveCommits = (db as unknown as {
      resolveCommits: (sid: string, gitRoot: string, repoName: string) => number;
    }).resolveCommits.bind(db);

    resolveCommits(sessionId, repoDir, 'repo-c');
    resolveCommits(sessionId, repoDir, 'repo-c');

    const rows = getCommitRows(db, sessionId);
    expect(rows).toHaveLength(1);

    const resolutions = getResolutionRows(db, sessionId);
    expect(resolutions).toHaveLength(1);
  });
});
