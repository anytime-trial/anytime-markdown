import * as path from 'path';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { resolveRepoName } from '../repoName';

function createDb(rows: { repo_name: string }[] | null): Database {
  const db = new BetterSqlite3(':memory:');
  if (rows !== null) {
    db.exec('CREATE TABLE current_code_graphs (repo_name TEXT)');
    const ins = db.prepare('INSERT INTO current_code_graphs (repo_name) VALUES (?)');
    for (const row of rows) {
      ins.run(row.repo_name);
    }
  }
  return db;
}

describe('resolveRepoName', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.TRAIL_REPO_NAME;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('opts.repoName 指定 → それを返す', () => {
    const db = createDb([{ repo_name: 'other' }]);
    expect(resolveRepoName({ repoName: 'explicit' }, db)).toBe('explicit');
    db.close();
  });

  it('TRAIL_REPO_NAME 環境変数 → 環境変数を返す', () => {
    process.env.TRAIL_REPO_NAME = 'from-env';
    const db = createDb([{ repo_name: 'other' }]);
    expect(resolveRepoName({}, db)).toBe('from-env');
    db.close();
  });

  it('DB に1件 → その値を返す', () => {
    const db = createDb([{ repo_name: 'my-repo' }]);
    expect(resolveRepoName({}, db)).toBe('my-repo');
    db.close();
  });

  it('DB に複数 → Error を throw する', () => {
    const db = createDb([{ repo_name: 'repo-a' }, { repo_name: 'repo-b' }]);
    expect(() => resolveRepoName({}, db)).toThrow('Multiple repos found, specify repoName');
    db.close();
  });

  it('DB に0件 → path.basename(workspacePath) を返す', () => {
    const db = createDb([]);
    expect(resolveRepoName({ workspacePath: '/home/user/my-project' }, db)).toBe('my-project');
    db.close();
  });

  it('DB に0件 + workspacePath 未指定 → path.basename(process.cwd()) を返す', () => {
    const db = createDb([]);
    expect(resolveRepoName({}, db)).toBe(path.basename(process.cwd()));
    db.close();
  });

  it('テーブル不在 → path.basename(workspacePath) にフォールバックする', () => {
    const db = createDb(null); // テーブルを作らない
    expect(resolveRepoName({ workspacePath: '/home/user/fallback-repo' }, db)).toBe('fallback-repo');
    db.close();
  });
});
