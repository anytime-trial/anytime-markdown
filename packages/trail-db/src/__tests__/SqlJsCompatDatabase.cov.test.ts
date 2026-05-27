/**
 * SqlJsCompatDatabase coverage tests
 *
 * Target uncovered lines:
 *   lines 73–74 — run() multi-statement path (normalized.length === 0 && isMultiStatement)
 *   line 106    — export() file-backed path (filePath != null → fs.readFileSync)
 *   line 120    — raw getter returns the underlying BetterSqlite3 database
 */

import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqlJsCompatDatabase } from '../internal/SqlJsCompatDatabase';

function makeInMemoryDb(): SqlJsCompatDatabase {
  const inner = new BetterSqlite3(':memory:');
  return new SqlJsCompatDatabase(inner);
}

function makeFileDb(): { db: SqlJsCompatDatabase; filePath: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-sqljscompat-cov-'));
  const filePath = path.join(tmpDir, 'test.db');
  const inner = new BetterSqlite3(filePath);
  const db = new SqlJsCompatDatabase(inner, filePath);
  return {
    db,
    filePath,
    cleanup: () => {
      try { inner.close(); } catch { /* already closed */ }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

// ──────────────────────────────────────────────────────────────
// run() multi-statement path (lines 73–74)
// ──────────────────────────────────────────────────────────────
describe('SqlJsCompatDatabase.run — multi-statement path (lines 73–74)', () => {
  it('executes multiple statements in a single run() call without params', () => {
    const db = makeInMemoryDb();
    // Multi-statement SQL with no params → isMultiStatement=true → inner.exec() path (line 73–74)
    db.run(`
      CREATE TABLE t1 (id INTEGER PRIMARY KEY) STRICT;
      CREATE TABLE t2 (id INTEGER PRIMARY KEY) STRICT;
    `);

    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('t1','t2') ORDER BY name",
    );
    expect(tables[0].values).toEqual([['t1'], ['t2']]);
    db.close();
  });

  it('run() multi-statement returns undefined (void), not an error', () => {
    const db = makeInMemoryDb();
    // Should not throw; the function returns void
    const result = db.run(`
      CREATE TABLE x (id INTEGER PRIMARY KEY) STRICT;
      CREATE INDEX idx_x_id ON x(id);
    `);
    expect(result).toBeUndefined();
    db.close();
  });

  it('run() single-statement with params does NOT take the multi-statement path', () => {
    const db = makeInMemoryDb();
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
    // Parameterized single statement → normalizeParams branch, not isMultiStatement
    db.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'hello']);
    const rows = db.exec('SELECT name FROM t WHERE id = 1');
    expect(rows[0].values).toEqual([['hello']]);
    db.close();
  });

  it('run() with SELECT executes via all() without throwing', () => {
    // stmt.reader=true branch inside run(): stmt.all() is called to consume result
    const db = makeInMemoryDb();
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
    db.run("INSERT INTO t VALUES (1)");
    // This is the stmt.reader branch (line 81): run() on a SELECT discards result silently
    expect(() => db.run('SELECT id FROM t WHERE id = 1', [])).not.toThrow();
    db.close();
  });
});

// ──────────────────────────────────────────────────────────────
// export() file-backed path (line 106)
// ──────────────────────────────────────────────────────────────
describe('SqlJsCompatDatabase.export — file-backed path (line 106)', () => {
  it('returns bytes read from the DB file when filePath is set', () => {
    const { db, filePath, cleanup } = makeFileDb();
    try {
      db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT) STRICT');
      db.run("INSERT INTO t VALUES (1, 'persisted')");

      // Exercises line 106: filePath != null → fs.readFileSync(this.filePath)
      const bytes = db.export();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      // Verify it is a valid SQLite file (magic bytes)
      const magic = Buffer.from(bytes.slice(0, 16)).toString('utf-8');
      expect(magic).toContain('SQLite format');

      // The exported bytes should be the same as the raw file
      const fileBytes = fs.readFileSync(filePath);
      expect(bytes.length).toBe(fileBytes.length);
    } finally {
      cleanup();
    }
  });

  it('in-memory db export() uses serialize() (not the file path branch)', () => {
    const db = makeInMemoryDb();
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
    const bytes = db.export();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    db.close();
  });
});

// ──────────────────────────────────────────────────────────────
// raw getter (line 120)
// ──────────────────────────────────────────────────────────────
describe('SqlJsCompatDatabase.raw getter (line 120)', () => {
  it('returns the underlying BetterSqlite3 Database instance', () => {
    const inner = new BetterSqlite3(':memory:');
    const db = new SqlJsCompatDatabase(inner);

    // Exercises line 120: get raw() { return this.inner; }
    const raw = db.raw;
    expect(raw).toBe(inner);

    // Verify it is a functional better-sqlite3 instance
    raw.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT').run();
    const result = raw.prepare('SELECT count(*) AS n FROM t').get() as { n: number };
    expect(result.n).toBe(0);

    db.close();
  });

  it('raw getter allows direct high-speed access bypassing shim', () => {
    const db = makeInMemoryDb();
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT');
    db.run("INSERT INTO t VALUES (1, 'direct')");

    // Use raw to perform a query directly via better-sqlite3 API
    const row = db.raw.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('direct');
    db.close();
  });
});
