/**
 * doc-core.db を開く（WAL・FK 有効化・マイグレーション適用）。
 * DB ドライバは Node 組み込みの `node:sqlite`（native module 不要）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations/runner';

export type DocDb = DatabaseSync;

export interface OpenDocDbOptions {
  /** 読み取り専用で開く（検索用途）。WAL 化・マイグレーションはしない（構築済み前提）。 */
  readonly?: boolean;
}

/**
 * doc-core.db を開いてマイグレーション適用済みのコネクションを返す。
 * `:memory:` を渡すとインメモリ DB（テスト用）。
 */
export function openDocDb(dbPath: string, opts: OpenDocDbOptions = {}): DocDb {
  if (opts.readonly) {
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    ro.exec('PRAGMA busy_timeout = 5000');
    return ro;
  }
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  // daemon が書き込み中に検索側が開く競合（WAL でも writer は排他）で即 SQLITE_BUSY に
  // ならないよう待機する（memory-core と同じ保険）。
  db.exec('PRAGMA busy_timeout = 5000');
  runMigrations(db);
  return db;
}
