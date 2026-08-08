/**
 * BetterSqlite3MemoryDb の単体テスト。
 *
 * Node のバージョンと better-sqlite3 のネイティブビルドが不整合 (NODE_MODULE_VERSION 不一致)
 * のとき require が失敗するため、その場合は describe.skip して環境互換 OK 環境のみで実行する。
 * (anytime-database の BetterSqlite3Adapter も同様の方針)
 */

let nativeAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  // require は通っても native binding (NODE_MODULE_VERSION) 不一致でインスタンス化が失敗するため、
  // ここまで通った場合のみ native available とみなす。
  const probe = new Database(':memory:');
  probe.close();
  nativeAvailable = true;
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('BetterSqlite3MemoryDb', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BetterSqlite3MemoryDb } = require('../../../src/db/connection/BetterSqlite3MemoryDb');

  test(':memory: で open でき、CREATE/INSERT/SELECT が回る', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT`);
    conn.run(`INSERT INTO t(id, name) VALUES (?, ?)`, [1, 'foo']);
    const r = conn.exec(`SELECT id, name FROM t`);
    expect(r[0].columns).toEqual(['id', 'name']);
    expect(r[0].values).toEqual([[1, 'foo']]);
    conn.close();
  });

  test('FTS5 仮想テーブルを作成できる', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    expect(() => conn.execMany(`CREATE VIRTUAL TABLE fts USING fts5(content)`)).not.toThrow();
    conn.close();
  });

  test('execMany は複数ステートメントを実行できる', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
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

  test('exec は 0 行のとき columns のみ返す', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER, name TEXT) STRICT`);
    const r = conn.exec(`SELECT id, name FROM t WHERE id = ?`, [9999]);
    expect(r[0].columns).toEqual(['id', 'name']);
    expect(r[0].values).toEqual([]);
    conn.close();
  });

  test('exec は mutation の場合 [] を返す', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER) STRICT`);
    const r = conn.exec(`INSERT INTO t(id) VALUES (1)`);
    expect(r).toEqual([]);
    conn.close();
  });

  test('prepare().run() は changes を返す', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT`);
    const stmt = conn.prepare(`INSERT INTO t(id) VALUES (?)`);
    const r = stmt.run(1);
    expect(r.changes).toBe(1);
    conn.close();
  });

  test('PRAGMA foreign_keys = ON が反映される', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.pragma('foreign_keys = ON');
    const r = conn.exec(`PRAGMA foreign_keys`);
    expect(r[0].values[0][0]).toBe(1);
    conn.close();
  });

  test('getRowsModified は直近の mutation の変更数を返す', () => {
    const conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`CREATE TABLE t (id INTEGER) STRICT`);
    conn.run(`INSERT INTO t(id) VALUES (?), (?), (?)`, [1, 2, 3]);
    expect(conn.getRowsModified()).toBe(3);
    conn.close();
  });
});
