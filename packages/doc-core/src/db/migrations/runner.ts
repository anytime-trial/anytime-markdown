/**
 * doc-core スキーマのマイグレーション実行。`_migrations` で適用済みバージョンを管理する。
 * DDL は {@link ./migrations} にインライン定義（バンドラ非依存・__dirname/.sql 読込なし）。
 */

import type { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

/** node:sqlite 同梱の SQLite は FTS5 を含むが、念のため存在を確認する。 */
export function hasFts5(db: DatabaseSync): boolean {
  try {
    db.exec('CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(content); DROP TABLE temp.__fts5_probe');
    return true;
  } catch {
    return false;
  }
}

/** 未適用のマイグレーションを順に実行する（冪等）。 */
export function runMigrations(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const applied = new Set<number>(
    db.prepare('SELECT version FROM _migrations').all().map((r) => (r as { version: number }).version),
  );
  if (!hasFts5(db)) {
    throw new Error('[doc-core] SQLite build lacks FTS5; doc_fts requires FTS5 (node:sqlite must be built with FTS5).');
  }
  const insert = db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)');
  const now = new Date().toISOString();
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec(m.sql);
    insert.run(m.version, now);
  }
}
