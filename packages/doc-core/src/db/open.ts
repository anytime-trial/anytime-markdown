/**
 * doc-core.db を開く（WAL・FK 有効化・マイグレーション適用）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations/runner';

export type DocDb = Database.Database;

/**
 * doc-core.db を開いてマイグレーション適用済みのコネクションを返す。
 * `:memory:` を渡すとインメモリ DB（テスト用）。
 */
export function openDocDb(dbPath: string): DocDb {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // daemon が書き込み中に mcp-trail が開く競合（WAL でも writer は排他）で即 SQLITE_BUSY に
  // ならないよう待機する（memory-core と同じ保険）。
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}
