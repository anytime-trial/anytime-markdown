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
});
