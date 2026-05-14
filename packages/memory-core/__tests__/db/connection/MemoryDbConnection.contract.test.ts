/**
 * MemoryDbConnection 実装 (BetterSqlite3MemoryDb) の挙動を保証する contract テスト。
 *
 * sql.js driver は撤去済 (better-sqlite3 一本化)。
 */
import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from '../../../src/db/connection/types';

describe('MemoryDbConnection contract (BetterSqlite3)', () => {
  let conn: MemoryDbConnection;

  beforeEach(() => {
    conn = BetterSqlite3MemoryDb.openInMemory();
    conn.execMany(`
      CREATE TABLE t (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        blob BLOB
      ) STRICT;
    `);
  });

  afterEach(() => conn.close());

  test('exec で空結果は columns だけ返す', () => {
    const r = conn.exec(`SELECT id, name FROM t WHERE id = ?`, [9999]);
    expect(r[0].columns).toEqual(['id', 'name']);
    expect(r[0].values).toEqual([]);
  });

  test('run で changes が記録される', () => {
    conn.run(`INSERT INTO t(name) VALUES (?)`, ['a']);
    expect(conn.getRowsModified()).toBe(1);
    conn.run(`INSERT INTO t(name) VALUES (?), (?)`, ['b', 'c']);
    expect(conn.getRowsModified()).toBe(2);
  });

  test('prepare().all() は RowObject[] を返す', () => {
    conn.run(`INSERT INTO t(name) VALUES (?), (?)`, ['a', 'b']);
    const stmt = conn.prepare(`SELECT id, name FROM t ORDER BY id`);
    const rows = stmt.all();
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('a');
    expect(rows[1].name).toBe('b');
  });

  test('BLOB を Uint8Array で読み書きできる', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    conn.run(`INSERT INTO t(name, blob) VALUES (?, ?)`, ['x', bytes]);
    const r = conn.exec(`SELECT blob FROM t WHERE name = ?`, ['x']);
    const stored = r[0].values[0][0] as Uint8Array | Buffer;
    // better-sqlite3 は Buffer を返すため Array.from で吸収する
    expect(Array.from(stored as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  test('execMany で複数ステートメント実行できる', () => {
    conn.execMany(`
      INSERT INTO t(name) VALUES ('m1');
      INSERT INTO t(name) VALUES ('m2');
    `);
    const r = conn.exec(`SELECT COUNT(*) AS c FROM t`);
    expect(Number(r[0].values[0][0])).toBe(2);
  });

  test('prepare().get() は単一行を返す', () => {
    conn.run(`INSERT INTO t(name) VALUES (?)`, ['solo']);
    const stmt = conn.prepare(`SELECT name FROM t WHERE id = ?`);
    const row = stmt.get(1);
    expect(row?.name).toBe('solo');
    expect(stmt.get(9999)).toBeUndefined();
  });
});
