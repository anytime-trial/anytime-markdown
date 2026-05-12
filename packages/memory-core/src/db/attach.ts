import type { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import { loadSqlJsModule } from './sqlJsLoader';
import { SqlJsMemoryDb } from './connection/SqlJsMemoryDb';
import { BetterSqlite3MemoryDb } from './connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from './connection/types';

/**
 * Attach trail.db to an existing memory-core db in read-only mode.
 *
 * Driver-aware implementation:
 *  - sql.js: WASM in-memory VFS — reads bytes into a second Database and ATTACH by
 *    internal filename; install a write guard on db.run / db.exec to block mutations
 *    to trail.*.
 *  - better-sqlite3: file-based ATTACH with `?mode=ro` URI. (write guard not yet
 *    implemented for better-sqlite3 — relies on SQLite enforcing readonly mode.)
 *
 * The returned `trailHandle` (sql.js path) must be closed alongside the main db.
 */
export interface AttachHandle {
  /** The sql.js Database holding the trail data (sql.js path only). */
  trailHandle?: Database;
}

export async function attachTrailDbReadOnly(
  db: MemoryDbConnection,
  trailDbPath: string,
): Promise<AttachHandle> {
  if (db instanceof SqlJsMemoryDb) {
    return attachSqlJs(db.getRawDb(), trailDbPath);
  }
  if (db instanceof BetterSqlite3MemoryDb) {
    db.attach(trailDbPath, 'trail', true);
    return {};
  }
  throw new Error(
    '[memory-core] attachTrailDbReadOnly: unsupported MemoryDbConnection implementation',
  );
}

async function attachSqlJs(db: Database, trailDbPath: string): Promise<AttachHandle> {
  const SQL: SqlJsStatic = await loadSqlJsModule();
  const data = fs.readFileSync(trailDbPath);
  const trailHandle = new SQL.Database(data);

  // The internal VFS filename is stored on the Database instance
  const trailFilename = (trailHandle as unknown as { filename: string }).filename;
  db.run(`ATTACH DATABASE '${trailFilename}' AS trail`);

  installTrailReadonlyGuard(db);

  return { trailHandle };
}

/**
 * Attach an already-open sql.js Database as trail (useful in tests).
 * The caller is responsible for the lifecycle of trailHandle.
 *
 * Accepts either a sql.js Database directly, or a MemoryDbConnection wrapping
 * a sql.js Database (SqlJsMemoryDb). better-sqlite3 path is not supported here
 * — use attachTrailDbReadOnly() with a file path.
 */
export function attachTrailDbFromHandle(
  db: Database | MemoryDbConnection,
  trailHandle: Database | MemoryDbConnection,
): void {
  const rawDb = db instanceof SqlJsMemoryDb ? db.getRawDb() : (db as Database);
  const rawHandle =
    trailHandle instanceof SqlJsMemoryDb ? trailHandle.getRawDb() : (trailHandle as Database);
  const trailFilename = (rawHandle as unknown as { filename: string }).filename;
  rawDb.run(`ATTACH DATABASE '${trailFilename}' AS trail`);
  installTrailReadonlyGuard(rawDb);
}

export function installTrailReadonlyGuard(db: Database): void {
  const originalRun = db.run.bind(db);
  const originalExec = db.exec.bind(db);

  type BindParams = Parameters<Database['run']>[1];

  function checkSql(sql: string): void {
    if (/^\s*(INSERT|UPDATE|DELETE)\s+/i.test(sql) && /\btrail\./i.test(sql)) {
      // Record in memory_failed_items before throwing (best effort)
      try {
        originalRun(
          `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(scope, item_key) DO UPDATE SET
             attempt_count = attempt_count + 1,
             failed_at = excluded.failed_at,
             detail = excluded.detail`,
          [
            'trail_db_write_attempt',
            sql.slice(0, 200),
            new Date().toISOString(),
            'write_to_trail_db_blocked',
            sql.slice(0, 1000),
          ]
        );
      } catch (_) {
        // best effort — do not mask original error
      }
      throw new Error(
        `[memory-core] Write to trail.* is forbidden (D24). SQL: ${sql.slice(0, 100)}`
      );
    }
  }

  (db as unknown as Record<string, unknown>).run = function (
    sql: string,
    params?: BindParams
  ) {
    checkSql(sql);
    return originalRun(sql, params);
  };

  (db as unknown as Record<string, unknown>).exec = function (sql: string, params?: BindParams) {
    checkSql(sql);
    return (originalExec as (sql: string, params?: BindParams) => ReturnType<Database['exec']>)(sql, params);
  };
}
