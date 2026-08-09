/**
 * トランザクションヘルパ。node:sqlite には better-sqlite3 の `db.transaction(fn)` 相当が無いため、
 * BEGIN/COMMIT で関数を囲み、例外時は ROLLBACK して元の例外を再 throw する。
 */

import type { DocDb } from './open';

export function withTx<T>(db: DocDb, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ROLLBACK 自体の失敗より元の err を優先して投げる（best-effort）。
    }
    throw err;
  }
}
