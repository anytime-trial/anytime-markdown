import * as fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import { loadBetterSqlite3 } from '../internal/loadBetterSqlite3';

export interface OpenedDb {
  readonly db: Database;
  readonly path: string;
  readonly mode: 'readonly' | 'readwrite';
  /**
   * 互換 API。better-sqlite3 はファイル直書きなので no-op。
   * sql.js 時代は in-memory → tmp + rename で atomic 書き出しだった。
   */
  save(): void;
  /** Database を close する */
  close(): void;
}

/**
 * trail.db を better-sqlite3 で開く。
 *
 * - readonly: better-sqlite3 の `readonly: true` で開き、SQLite 層で書き込み拒否
 * - readwrite: 通常 open。変更は WAL を経由してメインファイルへ反映される。
 *
 * sql.js (WASM in-memory) 時代と異なり、better-sqlite3 はファイル直書きなので
 * `save()` は no-op。呼び出し側 (旧 atomic 書き出し前提のコード) を破壊しない
 * ために API は残す。
 */
export async function openTrailDb(
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): Promise<OpenedDb> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`trail.db not found: ${dbPath}`);
  }
  const Ctor = loadBetterSqlite3();
  const db = new Ctor(dbPath, { readonly: mode === 'readonly' });

  const save = (): void => {
    if (mode !== 'readwrite') {
      throw new Error('Cannot save: db opened in readonly mode');
    }
    // better-sqlite3 はメインファイルに直書きするため明示的な flush 不要。
    // WAL モードの場合 PRAGMA wal_checkpoint(TRUNCATE) を呼ぶこともできるが、
    // close() 時に SQLite 側で checkpoint されるので通常は不要。
  };

  const close = (): void => {
    db.close();
  };

  return { db, path: dbPath, mode, save, close };
}
