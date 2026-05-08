import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';

/**
 * Attach trail.db to an existing memory-core db in read-only mode.
 *
 * sql.js runs in a WASM in-memory VFS — ATTACH DATABASE with a host filesystem
 * path does not work. Instead, this function:
 *  1. Reads the trail.db bytes from disk
 *  2. Opens them as a second sql.js Database (in the same WASM module)
 *  3. ATTACHes it using the internal VFS filename
 *  4. Installs a write guard on db.run / db.exec to block mutations to trail.*
 *
 * The returned `trailHandle` must be closed alongside the main db.
 */
export interface AttachHandle {
  /** The sql.js Database holding the trail data — close this alongside the main db. */
  trailHandle: Database;
}

export async function attachTrailDbReadOnly(
  db: Database,
  trailDbPath: string
): Promise<AttachHandle> {
  const SQL: SqlJsStatic = await initSqlJs();
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
 */
export function attachTrailDbFromHandle(db: Database, trailHandle: Database): void {
  const trailFilename = (trailHandle as unknown as { filename: string }).filename;
  db.run(`ATTACH DATABASE '${trailFilename}' AS trail`);
  installTrailReadonlyGuard(db);
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

  (db as unknown as Record<string, unknown>).exec = function (sql: string) {
    checkSql(sql);
    return originalExec(sql);
  };
}
