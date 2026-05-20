import BetterSqlite3 from 'better-sqlite3';
import { all, get, run } from '../../sqlite/sqlJsUtil';

function createTestDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      value REAL
    );
    INSERT INTO items (id, name, value) VALUES (1, 'alpha', 1.5);
    INSERT INTO items (id, name, value) VALUES (2, 'beta', NULL);
  `);
  return db;
}

describe('sqlJsUtil', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('all()', () => {
    it('全行を返す', () => {
      const rows = all<{ id: number; name: string }>(db, 'SELECT id, name FROM items ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe(1);
      expect(rows[0].name).toBe('alpha');
      expect(rows[1].id).toBe(2);
      expect(rows[1].name).toBe('beta');
    });

    it('パラメータを使ったフィルタで正しい行を返す', () => {
      const rows = all<{ id: number; name: string }>(
        db,
        'SELECT id, name FROM items WHERE id = ?',
        [2],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('beta');
    });

    it('マッチしない場合は空配列を返す', () => {
      const rows = all(db, 'SELECT * FROM items WHERE id = ?', [999]);
      expect(rows).toEqual([]);
    });

    it('パラメータなしでデフォルト空配列が動作する', () => {
      const rows = all(db, 'SELECT * FROM items ORDER BY id');
      expect(rows).toHaveLength(2);
    });
  });

  describe('get()', () => {
    it('単一行を返す', () => {
      const row = get<{ name: string; value: number | null }>(
        db,
        'SELECT name, value FROM items WHERE id = ?',
        [1],
      );
      expect(row).toBeDefined();
      expect(row!.name).toBe('alpha');
      expect(row!.value).toBeCloseTo(1.5);
    });

    it('マッチしない場合は undefined を返す', () => {
      const row = get(db, 'SELECT * FROM items WHERE id = ?', [999]);
      expect(row).toBeUndefined();
    });

    it('複数行マッチ時は最初の行のみ返す', () => {
      const row = get<{ id: number }>(db, 'SELECT id FROM items ORDER BY id');
      expect(row!.id).toBe(1);
    });

    it('NULL 値を含む行を正しく返す', () => {
      const row = get<{ id: number; value: number | null }>(
        db,
        'SELECT id, value FROM items WHERE id = ?',
        [2],
      );
      expect(row!.value).toBeNull();
    });
  });

  describe('run()', () => {
    it('INSERT で changes が 1 を返す', () => {
      const result = run(
        db,
        'INSERT INTO items (id, name, value) VALUES (?, ?, ?)',
        [10, 'gamma', 3.0],
      );
      expect(result.changes).toBe(1);

      const row = get<{ name: string }>(db, 'SELECT name FROM items WHERE id = ?', [10]);
      expect(row!.name).toBe('gamma');
    });

    it('UPDATE で影響した行数が changes に反映される', () => {
      const result = run(db, 'UPDATE items SET name = ? WHERE id = ?', ['updated', 1]);
      expect(result.changes).toBe(1);

      const row = get<{ name: string }>(db, 'SELECT name FROM items WHERE id = ?', [1]);
      expect(row!.name).toBe('updated');
    });

    it('DELETE で対象行数が changes に反映される', () => {
      const result = run(db, 'DELETE FROM items WHERE id = ?', [2]);
      expect(result.changes).toBe(1);

      const remaining = all(db, 'SELECT * FROM items');
      expect(remaining).toHaveLength(1);
    });

    it('マッチしない UPDATE で changes が 0 を返す', () => {
      const result = run(db, 'UPDATE items SET name = ? WHERE id = ?', ['ghost', 999]);
      expect(result.changes).toBe(0);
    });

    it('複数行 DELETE で changes が複数行を返す', () => {
      const result = run(db, 'DELETE FROM items');
      expect(result.changes).toBe(2);
    });

    it('パラメータなしでデフォルト空配列が動作する', () => {
      const result = run(db, 'DELETE FROM items');
      expect(result.changes).toBeGreaterThanOrEqual(0);
    });
  });
});
