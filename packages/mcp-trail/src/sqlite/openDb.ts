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
  return wrapOpenedDb(db, dbPath, mode);
}

/**
 * memory-core.db を better-sqlite3 で開く。
 *
 * Flight Record（instructions / instruction_sessions / flight_reviews）の移設
 * （2026-08-07）に伴い、指示台帳の直書きはこちらを使う。ファイル不在は throw
 * （解決側 resolveMemoryDbPath と同じ fail-closed。空 DB を黙って作ると以降の
 * クエリが一律 0 件の偽陰性になる）。拡張の memory pipeline / デーモンと同一
 * ファイルを共有するため busy_timeout を設定する（WAL 前提で書き込みは短時間）。
 */
export async function openMemoryDb(
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): Promise<OpenedDb> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`memory-core.db not found: ${dbPath}`);
  }
  const Ctor = loadBetterSqlite3();
  const db = new Ctor(dbPath, { readonly: mode === 'readonly' });
  db.pragma('busy_timeout = 5000');
  // trail.db 時代と同じく FK は強制しない（better-sqlite3 は既定 ON。
  // instruction_sessions の FK は宣言のみの運用 — trail-core tables.ts のコメント参照）
  db.pragma('foreign_keys = OFF');
  return wrapOpenedDb(db, dbPath, mode);
}

function wrapOpenedDb(
  db: Database,
  dbPath: string,
  mode: 'readonly' | 'readwrite',
): OpenedDb {
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
