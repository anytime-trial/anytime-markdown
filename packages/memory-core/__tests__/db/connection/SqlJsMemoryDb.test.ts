import { SqlJsMemoryDb } from '../../../src/db/connection/SqlJsMemoryDb';

describe('SqlJsMemoryDb', () => {
  test(':memory: で open でき、CREATE/INSERT/SELECT が回る', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT`);
    conn.run(`INSERT INTO t(id, name) VALUES (?, ?)`, [1, 'foo']);
    const r = conn.exec(`SELECT id, name FROM t`);
    expect(r[0].columns).toEqual(['id', 'name']);
    expect(r[0].values).toEqual([[1, 'foo']]);
    conn.close();
  });

  test('FTS5 仮想テーブルは sql.js デフォルトでは失敗する (NG として記録)', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    expect(() => conn.execMany(`CREATE VIRTUAL TABLE fts USING fts5(content)`)).toThrow(/fts5/i);
    conn.close();
  });

  test('execMany は複数ステートメントを実行できる', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`
      CREATE TABLE a (x INTEGER) STRICT;
      CREATE TABLE b (y INTEGER) STRICT;
      INSERT INTO a(x) VALUES (1);
      INSERT INTO b(y) VALUES (2);
    `);
    const a = conn.exec(`SELECT x FROM a`);
    const b = conn.exec(`SELECT y FROM b`);
    expect(a[0].values).toEqual([[1]]);
    expect(b[0].values).toEqual([[2]]);
    conn.close();
  });

  test('exec は 0 行のとき columns のみ返す', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER, name TEXT) STRICT`);
    const r = conn.exec(`SELECT id, name FROM t WHERE id = ?`, [9999]);
    expect(r[0].columns).toEqual(['id', 'name']);
    expect(r[0].values).toEqual([]);
    conn.close();
  });

  test('exec は mutation の場合 [] を返す', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER) STRICT`);
    const r = conn.exec(`INSERT INTO t(id) VALUES (1)`);
    expect(r).toEqual([]);
    conn.close();
  });

  test('prepare().run() は changes を返す', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT`);
    const stmt = conn.prepare(`INSERT INTO t(id) VALUES (?)`);
    const r = stmt.run(1);
    expect(r.changes).toBe(1);
    conn.close();
  });

  test('getRowsModified は直近の mutation の変更数を返す', async () => {
    const conn = await SqlJsMemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER) STRICT`);
    conn.run(`INSERT INTO t(id) VALUES (?), (?), (?)`, [1, 2, 3]);
    expect(conn.getRowsModified()).toBe(3);
    conn.close();
  });

  test('openFromBytes で永続データから復元できる', async () => {
    const seed = await SqlJsMemoryDb.openInMemory();
    seed.execMany(`CREATE TABLE t (id INTEGER, name TEXT) STRICT`);
    seed.run(`INSERT INTO t(id, name) VALUES (?, ?)`, [42, 'persisted']);
    const bytes = seed.exportBytes();
    seed.close();

    const conn = await SqlJsMemoryDb.openFromBytes(bytes);
    const r = conn.exec(`SELECT id, name FROM t`);
    expect(r[0].values).toEqual([[42, 'persisted']]);
    conn.close();
  });
});
