import type { Database } from 'better-sqlite3';

type Param = string | number | bigint | null | Uint8Array;

/**
 * better-sqlite3 ベースの薄い helper。
 *
 * Phase 3 (sql.js 撤去) 以前は sql.js Database 上で書かれていた API シグネチャを
 * 維持しつつ、内部だけ better-sqlite3 ネイティブ API へ切り替えてある。
 * 旧ファイル名 `sqlJsUtil.ts` のままだが、実装は sql.js に依存しない。
 */

/** prepare + 全行取得 */
export function all<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...(params as Param[])) as T[];
}

/** prepare + 単一行 */
export function get<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): T | undefined {
  const stmt = db.prepare(sql);
  return stmt.get(...(params as Param[])) as T | undefined;
}

/** INSERT/UPDATE/DELETE を実行し、影響行数を返す */
export function run(
  db: Database,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): { changes: number } {
  const stmt = db.prepare(sql);
  const info = stmt.run(...(params as Param[]));
  return { changes: info.changes };
}
