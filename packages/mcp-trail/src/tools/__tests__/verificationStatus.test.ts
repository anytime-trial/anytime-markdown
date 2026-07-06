import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { handleGetVerificationStatus } from '../verificationStatus';

// スキーマ正本は scripts/verification-db.mjs。テスト fixture 用の複製(列は読取対象のみ揃える)。
const FIXTURE_DDL = `
CREATE TABLE verification_runs (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  kind TEXT NOT NULL,
  package TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  commit_hash TEXT NOT NULL,
  tree_state TEXT NOT NULL,
  code_state_hash TEXT,
  environment TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
) STRICT;
`;

describe('handleGetVerificationStatus', () => {
  let workDir: string;
  let savedTrailHome: string | undefined;

  function git(args: string[]): string {
    return execFileSync('git', args, { cwd: workDir, encoding: 'utf8' }).trim();
  }

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifstatus-'));
    savedTrailHome = process.env.TRAIL_HOME;
    process.env.TRAIL_HOME = path.join(workDir, '.anytime', 'trail');
    git(['init']);
    // 実リポジトリの .gitignore は .anytime を除外している。台帳 DB 自体が dirty 判定を汚さないよう再現する。
    fs.writeFileSync(path.join(workDir, '.gitignore'), '.anytime\n');
    git(['add', '.gitignore']);
    git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-m', 'init']);
  });

  afterEach(() => {
    if (savedTrailHome === undefined) delete process.env.TRAIL_HOME;
    else process.env.TRAIL_HOME = savedTrailHome;
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function seedDb(rows: Array<{ kind: string; status: string; codeStateHash: string | null }>): void {
    const dbPath = path.join(workDir, '.anytime', 'trail', 'db', 'verification.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(FIXTURE_DDL);
    const insert = db.prepare(
      `INSERT INTO verification_runs
       (kind, package, command, status, duration_ms, commit_hash, tree_state, code_state_hash, started_at, finished_at)
       VALUES (?, 'demo-pkg', 'cmd', ?, 1, ?, 'clean', ?, '2026-07-06T00:00:00.000Z', '2026-07-06T00:00:01.000Z')`,
    );
    for (const r of rows) insert.run(r.kind, r.status, r.codeStateHash ?? 'other', r.codeStateHash);
    db.close();
  }

  it('DB が無ければ全 kind が needsRun (reason: no-db)', async () => {
    const result = await handleGetVerificationStatus({ package: 'demo-pkg', workspacePath: workDir });
    expect(result.reason).toBe('no-db');
    expect(result.needsRun).toContain('unit');
    expect(result.needsRun).toContain('manual');
  });

  it('HEAD の pass 記録がある kind は verified、無い kind は needsRun', async () => {
    const head = git(['rev-parse', 'HEAD']);
    seedDb([
      { kind: 'unit', status: 'pass', codeStateHash: head },
      { kind: 'build', status: 'fail', codeStateHash: head },
    ]);
    const result = await handleGetVerificationStatus({ package: 'demo-pkg', workspacePath: workDir });
    expect(result.treeState).toBe('clean');
    expect(Object.keys(result.verified)).toEqual(['unit']);
    expect(result.needsRun).toContain('build');
    expect(result.needsRun).not.toContain('unit');
  });

  it('dirty tree は常に全 kind needsRun (reason: dirty-tree)', async () => {
    const head = git(['rev-parse', 'HEAD']);
    seedDb([{ kind: 'unit', status: 'pass', codeStateHash: head }]);
    fs.writeFileSync(path.join(workDir, 'x.txt'), 'dirty');
    const result = await handleGetVerificationStatus({ package: 'demo-pkg', workspacePath: workDir });
    expect(result.reason).toBe('dirty-tree');
    expect(result.needsRun).toContain('unit');
  });

  it('kinds 指定で対象を絞れる', async () => {
    const head = git(['rev-parse', 'HEAD']);
    seedDb([
      { kind: 'unit', status: 'pass', codeStateHash: head },
      { kind: 'build', status: 'pass', codeStateHash: head },
    ]);
    const result = await handleGetVerificationStatus({
      package: 'demo-pkg',
      kinds: ['unit', 'e2e'],
      workspacePath: workDir,
    });
    // build は pass 記録があっても kinds 外なので verified/needsRun のどちらにも現れない
    expect(Object.keys(result.verified)).toEqual(['unit']);
    expect(result.needsRun).toEqual(['e2e']);
  });

  it('DB ファイルはあるがテーブルが無ければ needsRun (reason: no-table)', async () => {
    const dbPath = path.join(workDir, '.anytime', 'trail', 'db', 'verification.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    new DatabaseSync(dbPath).close(); // テーブル未作成の空 DB
    const result = await handleGetVerificationStatus({ package: 'demo-pkg', workspacePath: workDir });
    expect(result.reason).toBe('no-table');
    expect(result.needsRun).toContain('unit');
  });
});
