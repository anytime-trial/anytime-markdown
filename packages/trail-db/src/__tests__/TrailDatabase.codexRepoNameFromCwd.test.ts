import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ columns: string[]; values: unknown[][] }>;
};

const MIGRATION_KEY = 'codex_repo_name_from_cwd_v3';
const PRIMARY_REPO = 'anytime-markdown';

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

/** Codex rollout を書く。cwd を省くと session_meta の無い rollout になる。 */
function writeRollout(dir: string, name: string, cwd?: string): string {
  const file = path.join(dir, `rollout-${name}.jsonl`);
  const lines =
    cwd === undefined
      ? [JSON.stringify({ type: 'response_item', payload: { role: 'user' } })]
      : [
          JSON.stringify({ type: 'session_meta', payload: { id: name, cwd } }),
          JSON.stringify({ type: 'response_item', payload: { role: 'user' } }),
        ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf-8');
  return file;
}

function makeRepo(root: string, name: string): string {
  const repo = path.join(root, name);
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  return repo;
}

interface SessionRow {
  readonly id: string;
  readonly filePath: string;
  readonly repoName: string;
  readonly source?: 'codex' | 'claude_code';
}

function insertSession(db: TrailDatabase, row: SessionRow): void {
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(row.repoName);
  inner(db).run(
    `INSERT INTO activity_sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source
     ) VALUES (?, '', ?, '', '', '', '', '', 0, ?, 0, '', ?)`,
    [row.id, repoId, row.filePath, row.source ?? 'codex'],
  );
}

function repoNameOf(db: TrailDatabase, sessionId: string): string | undefined {
  const rows =
    inner(db).exec(
      'SELECT r.repo_name FROM activity_sessions s LEFT JOIN activity_repos r ON r.repo_id = s.repo_id WHERE s.id = ?',
      [sessionId],
    )[0]?.values ?? [];
  return rows[0]?.[0] as string | undefined;
}

const callMigration = (db: TrailDatabase): void => {
  (db as unknown as { backfillCodexRepoNameFromCwd_v3: () => void }).backfillCodexRepoNameFromCwd_v3();
};

/** DB 初期化時に記録済みのキーを消してから実行する（空 DB では初期化時に no-op で完了している）。 */
const runMigration = (db: TrailDatabase): void => {
  inner(db).run('DELETE FROM _migrations WHERE key = ?', [MIGRATION_KEY]);
  callMigration(db);
};

describe('migration: backfillCodexRepoNameFromCwd_v3', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexRepoNameFromCwd-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-attributes a codex row to the repository of the rollout cwd', async () => {
    const repo = makeRepo(tmpDir, 'other-project');
    const sub = path.join(repo, 'packages', 'app');
    fs.mkdirSync(sub, { recursive: true });
    const filePath = writeRollout(tmpDir, 'resolved', sub);

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-resolved', filePath, repoName: PRIMARY_REPO });
    runMigration(db);

    expect(repoNameOf(db, 'sid-resolved')).toBe('other-project');
  });

  it('assigns codex-unknown when the rollout has no session_meta', async () => {
    const filePath = writeRollout(tmpDir, 'absent');

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-absent', filePath, repoName: PRIMARY_REPO });
    runMigration(db);

    // 主リポジトリ名のまま残すと、他プロジェクトのセッションを自リポジトリのものとして数える。
    expect(repoNameOf(db, 'sid-absent')).toBe('codex-unknown');
  });

  it('keeps the row when the rollout file no longer exists', async () => {
    const db = await createTestTrailDatabase();
    insertSession(db, {
      id: 'sid-missing',
      filePath: path.join(tmpDir, 'rollout-rotated.jsonl'),
      repoName: PRIMARY_REPO,
    });
    runMigration(db);

    expect(repoNameOf(db, 'sid-missing')).toBe(PRIMARY_REPO);
  });

  it('keeps the row when the rollout cannot be read', async () => {
    // ディレクトリを file_path に置くと read が EISDIR で失敗する（ENOENT 以外の読み取り失敗）。
    const unreadable = path.join(tmpDir, 'rollout-is-a-directory.jsonl');
    fs.mkdirSync(unreadable);

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-unreadable', filePath: unreadable, repoName: PRIMARY_REPO });
    runMigration(db);

    // 読めなかったことは「cwd が無い」ことの根拠にならない。codex-unknown へ上書きしない。
    expect(repoNameOf(db, 'sid-unreadable')).toBe(PRIMARY_REPO);
  });

  it('leaves a row unchanged when the derived repository already matches', async () => {
    const repo = makeRepo(tmpDir, 'same-repo');
    const filePath = writeRollout(tmpDir, 'same', repo);

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-same', filePath, repoName: 'same-repo' });
    runMigration(db);

    expect(repoNameOf(db, 'sid-same')).toBe('same-repo');
  });

  it('does not touch sessions from other sources', async () => {
    const repo = makeRepo(tmpDir, 'other-project');
    const filePath = writeRollout(tmpDir, 'claude', repo);

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-claude', filePath, repoName: PRIMARY_REPO, source: 'claude_code' });
    runMigration(db);

    expect(repoNameOf(db, 'sid-claude')).toBe(PRIMARY_REPO);
  });

  it('records the migration key and does not run again', async () => {
    const first = makeRepo(tmpDir, 'first-repo');
    const second = makeRepo(tmpDir, 'second-repo');
    const filePath = writeRollout(tmpDir, 'idem', first);

    const db = await createTestTrailDatabase();
    insertSession(db, { id: 'sid-idem', filePath, repoName: PRIMARY_REPO });
    runMigration(db);
    expect(repoNameOf(db, 'sid-idem')).toBe('first-repo');

    // キー記録後は、rollout の内容が変わっていても再実行で行を書き換えない。
    writeRollout(tmpDir, 'idem', second);
    callMigration(db);

    expect(repoNameOf(db, 'sid-idem')).toBe('first-repo');
    const keys = inner(db).exec('SELECT key FROM _migrations WHERE key = ?', [MIGRATION_KEY])[0]?.values ?? [];
    expect(keys.length).toBe(1);
  });
});
