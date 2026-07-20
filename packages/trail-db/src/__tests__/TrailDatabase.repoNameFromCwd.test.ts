import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ columns: string[]; values: unknown[][] }>;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

function writeSessionJsonl(dir: string, sessionId: string, cwd: string): string {
  const file = path.join(dir, `${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({ type: 'last-prompt', sessionId }),
    JSON.stringify({
      type: 'user',
      sessionId,
      cwd,
      timestamp: '2026-05-18T10:00:00.000Z',
      message: { content: 'hello' },
    }),
  ];
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return file;
}

function insertExistingSession(db: TrailDatabase, sessionId: string, filePath: string, oldRepoName: string): void {
  // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(oldRepoName);
  inner(db).run(
    `INSERT INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source
     ) VALUES (?, '', ?, '', '', '', '', '', 0, ?, 0, '', 'claude_code')`,
    [sessionId, repoId, filePath],
  );
}

// Phase H-4: sessions.repo_name 列は撤去済。session の repo 名は repo_id 経由で repos から引く。
function repoNameOf(db: TrailDatabase, sessionId: string): string | undefined {
  const rows = inner(db).exec(
    `SELECT r.repo_name FROM sessions s LEFT JOIN repos r ON r.repo_id = s.repo_id WHERE s.id = ?`,
    [sessionId],
  )[0]?.values ?? [];
  return rows[0]?.[0] as string | undefined;
}

describe('sessions.repo_name is derived from JSONL cwd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoNameFromCwd-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('migration: backfillSessionsRepoNameFromCwd_v1', () => {
    it('updates existing rows to use JSONL cwd basename', async () => {
      const filePath = writeSessionJsonl(tmpDir, 'sid-aaa', '/anytime-trade');
      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-aaa', filePath, 'anytime-markdown');

      // Migration already ran in init() before this row existed → re-run by clearing flag.
      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();

      expect(repoNameOf(db, 'sid-aaa')).toBe('anytime-trade');
    });

    it('collapses worktree cwd into the parent repo name', async () => {
      const filePath = writeSessionJsonl(tmpDir, 'sid-wt', '/anytime-markdown/.worktrees/feature-x');
      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-wt', filePath, 'anytime-markdown');
      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();

      expect(repoNameOf(db, 'sid-wt')).toBe('anytime-markdown');
    });

    it('keeps row unchanged when JSONL cwd basename matches existing repo_name', async () => {
      const filePath = writeSessionJsonl(tmpDir, 'sid-match', '/anytime-markdown');
      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-match', filePath, 'anytime-markdown');
      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();

      expect(repoNameOf(db, 'sid-match')).toBe('anytime-markdown');
    });

    it('falls back to project dir name (stripped of leading dash) when JSONL is missing', async () => {
      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-anytime-trade');
      fs.mkdirSync(projectsDir, { recursive: true });
      const missingFile = path.join(projectsDir, 'sid-missing.jsonl');
      // do NOT create the file

      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-missing', missingFile, 'anytime-markdown');
      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();

      expect(repoNameOf(db, 'sid-missing')).toBe('anytime-trade');
    });

    it('is idempotent (running twice yields the same result)', async () => {
      const filePath = writeSessionJsonl(tmpDir, 'sid-idem', '/anytime-lab');
      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-idem', filePath, 'anytime-markdown');

      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();
      // 2 回目はフラグで早期 return される
      (db as unknown as { backfillSessionsRepoNameFromCwd_v1: () => void }).backfillSessionsRepoNameFromCwd_v1();

      expect(repoNameOf(db, 'sid-idem')).toBe('anytime-lab');
      const migrationRows = inner(db).exec("SELECT key FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'")[0]?.values ?? [];
      expect(migrationRows.length).toBe(1);
    });
  });

  describe('migration: backfillSessionsRepoNameFromGitRoot_v2', () => {
    const runV2 = (db: TrailDatabase): void => {
      inner(db).run("DELETE FROM _migrations WHERE key = 'sessions_repo_name_from_git_root_v2'");
      (db as unknown as { backfillSessionsRepoNameFromGitRoot_v2: () => void })
        .backfillSessionsRepoNameFromGitRoot_v2();
    };

    it('re-attributes a subdirectory session to the enclosing repository', async () => {
      const repo = path.join(tmpDir, 'myrepo');
      const sub = path.join(repo, 'scripts', 'vscode-extension');
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      fs.mkdirSync(sub, { recursive: true });
      const filePath = writeSessionJsonl(tmpDir, 'sid-sub', sub);

      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-sub', filePath, 'myrepo-scripts-vscode-extension');
      runV2(db);

      expect(repoNameOf(db, 'sid-sub')).toBe('myrepo');
    });

    it('recovers the repo from the projects dir name when the JSONL is gone', async () => {
      // projects ディレクトリ名は cwd の `/` を `-` へ潰した平坦化名。実在パスへ一意に
      // 復元できるなら、平坦化名ではなく本来のリポジトリ名へ是正する。
      const repo = path.join(tmpDir, 'myrepo');
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'packages', 'web-app'), { recursive: true });
      const flattened = `-${path.join(tmpDir, 'myrepo', 'packages', 'web-app').split('/').filter((s) => s !== '').join('-')}`;
      const projectsDir = path.join(tmpDir, '.claude', 'projects', flattened);
      fs.mkdirSync(projectsDir, { recursive: true });
      const missingFile = path.join(projectsDir, 'sid-gone.jsonl');

      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-gone', missingFile, 'flattened-bogus-name');
      runV2(db);

      expect(repoNameOf(db, 'sid-gone')).toBe('myrepo');
    });

    it('keeps the current attribution when the path cannot be recovered', async () => {
      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-no-such-path-anywhere');
      fs.mkdirSync(projectsDir, { recursive: true });
      const missingFile = path.join(projectsDir, 'sid-unknown.jsonl');

      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-unknown', missingFile, 'no-such-path-anywhere');
      runV2(db);

      // 推測でリポジトリ名を作らない（誤った帰属を作るより未解決のまま残す）。
      expect(repoNameOf(db, 'sid-unknown')).toBe('no-such-path-anywhere');
    });

    it('is idempotent (running twice yields the same result)', async () => {
      const repo = path.join(tmpDir, 'idem-repo');
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      const filePath = writeSessionJsonl(tmpDir, 'sid-v2-idem', repo);

      const db = await createTestTrailDatabase();
      insertExistingSession(db, 'sid-v2-idem', filePath, 'anytime-markdown');
      runV2(db);
      (db as unknown as { backfillSessionsRepoNameFromGitRoot_v2: () => void })
        .backfillSessionsRepoNameFromGitRoot_v2();

      expect(repoNameOf(db, 'sid-v2-idem')).toBe('idem-repo');
      const rows = inner(db).exec(
        "SELECT key FROM _migrations WHERE key = 'sessions_repo_name_from_git_root_v2'",
      )[0]?.values ?? [];
      expect(rows.length).toBe(1);
    });
  });
});
