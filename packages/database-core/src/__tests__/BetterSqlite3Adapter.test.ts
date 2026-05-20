import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { BetterSqlite3Adapter } from '../BetterSqlite3Adapter';

const FIXTURE = join(__dirname, 'fixtures', 'sample.sqlite');

function withTempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'amd-db-'));
  const path = join(dir, 'sample.sqlite');
  copyFileSync(FIXTURE, path);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** FK を持つテーブルを含む一時 DB を作成する */
function withFkDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'amd-db-fk-'));
  const path = join(dir, 'fk.sqlite');
  const db = new Database(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      dept_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY,
      dept_id INTEGER NOT NULL REFERENCES departments
    );
    CREATE VIEW v_dept_count AS
      SELECT dept_id, COUNT(*) AS cnt FROM employees GROUP BY dept_id;
    INSERT INTO departments VALUES (1, 'Eng');
    INSERT INTO employees VALUES (1, 1, 'Alice');
    INSERT INTO contracts VALUES (1, 1);
  `);
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** BLOB・NULL・object を含む行を持つ一時 DB を作成する */
function withSpecialCellDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'amd-db-cell-'));
  const path = join(dir, 'cell.sqlite');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      data BLOB,
      label TEXT
    );
    INSERT INTO items VALUES (1, NULL, 'no-blob');
  `);
  const stmt = db.prepare('INSERT INTO items VALUES (?, ?, ?)');
  stmt.run(2, Buffer.from([0xde, 0xad, 0xbe]), 'blob-row');
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('BetterSqlite3Adapter', () => {
  it('listSchema returns tables and views', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const schema = await a.listSchema();
    expect(schema.tables.map((x) => x.name).sort()).toEqual(['posts', 'users']);
    expect(schema.views.map((x) => x.name)).toEqual(['v_user_post_count']);
    await a.dispose();
    t.cleanup();
  });

  it('selectRows returns paginated rows', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const r = await a.selectRows({ table: 'users', limit: 10, offset: 0 });
    expect(r.columns).toEqual(['id', 'name', 'email']);
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0][1]).toBe('User 1');
    await a.dispose();
    t.cleanup();
  });

  it('countRows returns total row count', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
    t.cleanup();
  });

  it('rejects unsafe identifier in selectRows', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    await expect(a.selectRows({ table: '1bad', limit: 1, offset: 0 })).rejects.toThrow(/unsafe/);
    await a.dispose();
    t.cleanup();
  });

  it('executeSql isMutation=false for SELECT', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    const r = await a.executeSql('SELECT id, name FROM users WHERE id < 4');
    expect(r.isMutation).toBe(false);
    expect(r.rows).toHaveLength(3);
    await a.dispose();
    t.cleanup();
  });

  it('executeSql isMutation=true for INSERT and uncommitted', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    const r = await a.executeSql("INSERT INTO users(name,email) VALUES ('Alice', 'a@x.com')");
    expect(r.isMutation).toBe(true);
    expect(r.rowsAffected).toBe(1);
    expect(await a.countRows('users')).toBe(101);
    await a.dispose();
    t.cleanup();

    // ROLLBACK されているため別アダプタで再オープンすると 100 件のままであること
    const t2 = withTempDb();
    const a2 = new BetterSqlite3Adapter({ filePath: t2.path, openMode: 'readonly' });
    expect(await a2.countRows('users')).toBe(100);
    await a2.dispose();
    t2.cleanup();
  });

  it('save commits and persists changes', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    await a.executeSql("INSERT INTO users(name,email) VALUES ('Bob', 'b@x.com')");
    await a.save();
    await a.dispose();
    const a2 = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    expect(await a2.countRows('users')).toBe(101);
    await a2.dispose();
    t.cleanup();
  });

  it('revert rolls back uncommitted changes', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    await a.executeSql("INSERT INTO users(name,email) VALUES ('Eve', 'e@x.com')");
    await a.revert();
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
    t.cleanup();
  });

  it('readonly mode rejects mutation SQL', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    await expect(
      a.executeSql("INSERT INTO users(name,email) VALUES ('X','x@x.com')"),
    ).rejects.toThrow(/read-only/i);
    await a.dispose();
    t.cleanup();
  });

  it('constructor with nativeBinding option passes it to better-sqlite3', async () => {
    // nativeBinding を指定したときのパス (L44) をカバーする。
    const t = withTempDb();
    const nativeBinding = join(
      __dirname,
      '../../../../node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    );
    const a = new BetterSqlite3Adapter({
      filePath: t.path,
      openMode: 'readonly',
      nativeBinding,
    });
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
    t.cleanup();
  });

  it('second readwrite open skips WAL setup when journal_mode is already WAL', async () => {
    // 最初の readwrite オープンで WAL に変換される
    const t = withTempDb();
    const a1 = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    await a1.save();
    await a1.dispose();
    // 2 回目: journal_mode = WAL 判定で PRAGMA journal_mode = WAL をスキップするパス (L53)
    const a2 = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    expect(await a2.countRows('users')).toBe(100);
    await a2.dispose();
    t.cleanup();
  });

  it('save is no-op when not in transaction (readonly mode)', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    // readonly mode では inTransaction=false → save() は早期リターン
    await expect(a.save()).resolves.toBeUndefined();
    await a.dispose();
    t.cleanup();
  });

  it('revert is no-op when not in transaction (readonly mode)', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    await expect(a.revert()).resolves.toBeUndefined();
    await a.dispose();
    t.cleanup();
  });

  it('listSchema includes foreignKeys when table has FK constraints', async () => {
    const t = withFkDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const schema = await a.listSchema();
    const empTable = schema.tables.find((tbl) => tbl.name === 'employees');
    expect(empTable).toBeDefined();
    expect(empTable?.foreignKeys).toBeDefined();
    expect(empTable?.foreignKeys).toHaveLength(1);
    expect(empTable?.foreignKeys![0]).toMatchObject({
      fromColumn: 'dept_id',
      toTable: 'departments',
    });
    // departments テーブルは FK なし → foreignKeys undefined
    const deptTable = schema.tables.find((tbl) => tbl.name === 'departments');
    expect(deptTable?.foreignKeys).toBeUndefined();
    // contracts テーブル: REFERENCES departments（列名省略） → fk.to = null → toColumn = ''
    const contractsTable = schema.tables.find((tbl) => tbl.name === 'contracts');
    expect(contractsTable?.foreignKeys).toBeDefined();
    expect(contractsTable?.foreignKeys![0].toColumn).toBe('');
    // views には foreignKeys が付かない
    const view = schema.views.find((v) => v.name === 'v_dept_count');
    expect(view).toBeDefined();
    expect(view?.foreignKeys).toBeUndefined();
    await a.dispose();
    t.cleanup();
  });

  it('selectRows formats NULL as empty string and BLOB as <BLOB:Nb>', async () => {
    const t = withSpecialCellDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const r = await a.selectRows({ table: 'items', limit: 10, offset: 0 });
    // id=1: data=NULL → ''
    const nullRow = r.rows.find((row) => row[0] === '1');
    expect(nullRow?.[1]).toBe('');
    // id=2: data=BLOB(3 bytes) → '<BLOB:3b>'
    const blobRow = r.rows.find((row) => row[0] === '2');
    expect(blobRow?.[1]).toBe('<BLOB:3b>');
    await a.dispose();
    t.cleanup();
  });
});
