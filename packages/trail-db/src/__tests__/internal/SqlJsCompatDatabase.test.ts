import BetterSqlite3 from 'better-sqlite3';
import { SqlJsCompatDatabase } from '../../internal/SqlJsCompatDatabase';

function makeDb(): SqlJsCompatDatabase {
  const inner = new BetterSqlite3(':memory:');
  return new SqlJsCompatDatabase(inner);
}

describe('SqlJsCompatDatabase', () => {
  describe('exec', () => {
    it('returns empty array for DDL statements', () => {
      const db = makeDb();
      const result = db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      expect(result).toEqual([]);
      db.close();
    });

    it('returns columns + values for SELECT', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'alice'), (2, 'bob')");
      const result = db.exec('SELECT id, name FROM t ORDER BY id');
      expect(result).toHaveLength(1);
      expect(result[0].columns).toEqual(['id', 'name']);
      expect(result[0].values).toEqual([
        [1, 'alice'],
        [2, 'bob'],
      ]);
      db.close();
    });

    it('accepts positional parameters', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'alice'), (2, 'bob')");
      const result = db.exec('SELECT name FROM t WHERE id = ?', [2]);
      expect(result[0].values).toEqual([['bob']]);
      db.close();
    });

    it('returns empty values array for SELECT with no rows', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
      const result = db.exec('SELECT id FROM t');
      expect(result).toHaveLength(1);
      expect(result[0].columns).toEqual(['id']);
      expect(result[0].values).toEqual([]);
      db.close();
    });

    it('handles multi-statement DDL', () => {
      const db = makeDb();
      db.exec(`
        CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;
        CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;
        CREATE INDEX idx_a_id ON a(id);
      `);
      const tables = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      expect(tables[0].values).toEqual([['a'], ['b']]);
      db.close();
    });

    it('handles PRAGMA returning rows', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      const result = db.exec('PRAGMA table_info(t)');
      expect(result).toHaveLength(1);
      expect(result[0].columns).toContain('name');
      expect(result[0].values.length).toBe(2);
      db.close();
    });

    it('handles WITH (CTE) as SELECT-shaped result', () => {
      const db = makeDb();
      const result = db.exec('WITH x AS (SELECT 1 AS v UNION SELECT 2) SELECT v FROM x ORDER BY v');
      expect(result[0].columns).toEqual(['v']);
      expect(result[0].values).toEqual([[1], [2]]);
      db.close();
    });

    it('converts undefined params to NULL', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, undefined]);
      const result = db.exec('SELECT name FROM t WHERE id = 1');
      expect(result[0].values).toEqual([[null]]);
      db.close();
    });
  });

  describe('run', () => {
    it('executes DDL', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name = 't'");
      expect(tables[0].values).toEqual([['t']]);
      db.close();
    });

    it('executes INSERT with params', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run('INSERT INTO t (id, name) VALUES (?, ?)', [42, 'x']);
      const r = db.exec('SELECT * FROM t');
      expect(r[0].values).toEqual([[42, 'x']]);
      db.close();
    });
  });

  describe('getRowsModified', () => {
    it('returns the number of rows changed by the last write', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER) STRICT');
      db.run('INSERT INTO t (id, v) VALUES (1, 10), (2, 20), (3, 30)');
      expect(db.getRowsModified()).toBe(3);
      db.run('UPDATE t SET v = v + 1 WHERE id <= 2');
      expect(db.getRowsModified()).toBe(2);
      db.close();
    });
  });

  describe('prepare', () => {
    it('bind + step + getAsObject', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'a'), (2, 'b')");
      const stmt = db.prepare('SELECT id, name FROM t WHERE id = ?');
      stmt.bind([2]);
      expect(stmt.step()).toBe(true);
      expect(stmt.getAsObject()).toEqual({ id: 2, name: 'b' });
      expect(stmt.step()).toBe(false);
      stmt.free();
      db.close();
    });

    it('bind + step + get returns positional values', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'a')");
      const stmt = db.prepare('SELECT id, name FROM t WHERE id = ?');
      stmt.bind([1]);
      stmt.step();
      expect(stmt.get()).toEqual([1, 'a']);
      stmt.free();
      db.close();
    });

    it('supports re-binding the same statement', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'a'), (2, 'b')");
      const stmt = db.prepare('SELECT name FROM t WHERE id = ?');
      stmt.bind([1]);
      stmt.step();
      expect(stmt.get()).toEqual(['a']);
      stmt.bind([2]);
      stmt.step();
      expect(stmt.get()).toEqual(['b']);
      stmt.free();
      db.close();
    });

    it('stmt.run with params updates getRowsModified', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      const stmt = db.prepare('INSERT INTO t (id, name) VALUES (?, ?)');
      stmt.run([1, 'a']);
      stmt.run([2, 'b']);
      expect(db.getRowsModified()).toBe(1);
      stmt.free();
      const r = db.exec('SELECT COUNT(*) FROM t');
      expect(r[0].values[0][0]).toBe(2);
      db.close();
    });

    it('step returns false when no rows match', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
      const stmt = db.prepare('SELECT id FROM t WHERE id = ?');
      stmt.bind([99]);
      expect(stmt.step()).toBe(false);
      stmt.free();
      db.close();
    });

    it('iterates multiple rows via repeated step()', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c')");
      const stmt = db.prepare('SELECT name FROM t ORDER BY id');
      stmt.bind([]);
      const names: string[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as { name: string };
        names.push(row.name);
      }
      expect(names).toEqual(['a', 'b', 'c']);
      stmt.free();
      db.close();
    });
  });

  describe('export', () => {
    it('returns a non-empty buffer for in-memory DB', () => {
      const db = makeDb();
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'hello')");
      const bytes = db.export();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
      const magic = Buffer.from(bytes.slice(0, 16)).toString('utf-8');
      expect(magic).toContain('SQLite format');
      db.close();
    });
  });
});
