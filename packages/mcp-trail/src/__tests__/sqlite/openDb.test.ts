import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { openTrailDb } from '../../sqlite/openDb';

describe('openTrailDb', () => {
  let tmpDir: string;
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-test-'));
    tmpDbPath = path.join(tmpDir, 'test.db');
    // 事前に DB ファイルを作成しておく
    const seed = new BetterSqlite3(tmpDbPath);
    seed.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    seed.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readonly モードで開ける', async () => {
    const opened = await openTrailDb(tmpDbPath, 'readonly');
    expect(opened.db).toBeDefined();
    expect(opened.mode).toBe('readonly');
    // readonly なので save は throw する
    expect(() => opened.save()).toThrow(/readonly/);
    opened.close();
  });

  it('readwrite モードで開ける + 変更がファイルに反映される', async () => {
    const opened = await openTrailDb(tmpDbPath, 'readwrite');
    expect(opened.db).toBeDefined();
    expect(opened.mode).toBe('readwrite');
    opened.db.prepare('INSERT INTO test (id) VALUES (1)').run();
    opened.save();
    opened.close();

    // 再度開いて反映を確認
    const reopened = await openTrailDb(tmpDbPath, 'readonly');
    const rows = reopened.db.prepare('SELECT id FROM test').all() as { id: number }[];
    expect(rows.map((r) => r.id)).toEqual([1]);
    reopened.close();
  });

  it('readwrite モードでもファイル直書き (tmp ファイルは残らない)', async () => {
    const opened = await openTrailDb(tmpDbPath, 'readwrite');
    opened.db.prepare('INSERT INTO test (id) VALUES (42)').run();
    opened.save();
    opened.close();

    // tmp ファイルが残っていないこと
    const remaining = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
    expect(remaining).toEqual([]);
  });

  it('存在しないパスで throw する', async () => {
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.db');
    await expect(openTrailDb(nonExistentPath, 'readonly')).rejects.toThrow(/not found/);
  });
});
