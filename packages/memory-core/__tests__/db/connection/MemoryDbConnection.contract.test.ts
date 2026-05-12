/**
 * MemoryDbConnection の 2 実装 (BetterSqlite3MemoryDb / SqlJsMemoryDb) の挙動が
 * 一致することを保証する contract テスト。
 *
 * better-sqlite3 の native binding が利用不可な環境では BetterSqlite3 側のみ skip する。
 */
import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { SqlJsMemoryDb } from '../../../src/db/connection/SqlJsMemoryDb';
import type { MemoryDbConnection } from '../../../src/db/connection/types';

let nativeAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const probe = new Database(':memory:');
  probe.close();
  nativeAvailable = true;
} catch {
  nativeAvailable = false;
}

const factories: Array<readonly [string, () => Promise<MemoryDbConnection>, boolean]> = [
  ['BetterSqlite3', async () => BetterSqlite3MemoryDb.openInMemory(), nativeAvailable],
  ['SqlJs', async () => SqlJsMemoryDb.openInMemory(), true],
];

for (const [name, factory, enabled] of factories) {
  const d = enabled ? describe : describe.skip;
  d(`MemoryDbConnection contract (${name})`, () => {
    let conn: MemoryDbConnection;

    beforeEach(async () => {
      conn = await factory();
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
      // better-sqlite3 は Buffer、sql.js は Uint8Array を返す。両者を Array で吸収
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
}
