/**
 * doc-core スキーマのマイグレーション実行。`_migrations` で適用済みバージョンを管理する。
 * DDL は {@link ./migrations} にインライン定義（バンドラ非依存・__dirname/.sql 読込なし）。
 */

import type { Database } from 'better-sqlite3';
import { MIGRATIONS } from './migrations';

/** better-sqlite3 は FTS5 を同梱するが、念のため存在を確認する。 */
export function hasFts5(db: Database): boolean {
  try {
    db.exec('CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(content); DROP TABLE temp.__fts5_probe');
    return true;
  } catch {
    return false;
  }
}

/** 未適用のマイグレーションを順に実行する（冪等）。 */
export function runMigrations(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const applied = new Set<number>(
    db.prepare('SELECT version FROM _migrations').all().map((r) => (r as { version: number }).version),
  );
  if (!hasFts5(db)) {
    throw new Error('[doc-core] SQLite build lacks FTS5; doc_fts requires FTS5 (use better-sqlite3).');
  }
  const insert = db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)');
  const now = new Date().toISOString();
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec(m.sql);
    insert.run(m.version, now);
  }
}
