import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3MemoryDb } from './connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from './connection/types';

/**
 * Attach trail.db to an existing memory-core db in read-only mode.
 *
 * BetterSqlite3MemoryDb 内部の read-only alias 管理 (アプリ層 SQL ガード) で
 * trail.* への INSERT/UPDATE/DELETE/REPLACE を阻止する。SQLite native の URI
 * readonly は better-sqlite3 が SQLITE_OPEN_URI を有効化していないため使えない
 * ため、本実装はアプリ層ガードに依存する。
 */
export async function attachTrailDbReadOnly(
  db: MemoryDbConnection,
  trailDbPath: string,
): Promise<void> {
  if (!(db instanceof BetterSqlite3MemoryDb)) {
    throw new Error(
      '[anytime-memory] attachTrailDbReadOnly: only BetterSqlite3MemoryDb is supported',
    );
  }
  db.attach(trailDbPath, 'trail', true);
}

/**
 * Attach an already-open BetterSqlite3MemoryDb (in-memory or file) as `trail`.
 *
 * テスト便宜のため `:memory:` で構築した trail handle をそのまま attach できるよう
 * `serialize()` で一時ファイルに書き出してから attachTrailDbReadOnly() を呼ぶ。
 * 残された一時ファイルは OS の tmpdir 掃除に任せる (テスト時のみの利用想定)。
 *
 * @deprecated 新規コードは `attachTrailDbReadOnly(db, trailDbPath)` を直接使うこと。
 */
export function attachTrailDbFromHandle(
  db: MemoryDbConnection,
  trailHandle: MemoryDbConnection,
): void {
  if (!(db instanceof BetterSqlite3MemoryDb)) {
    throw new Error(
      '[anytime-memory] attachTrailDbFromHandle: only BetterSqlite3MemoryDb is supported for main db',
    );
  }
  if (!(trailHandle instanceof BetterSqlite3MemoryDb)) {
    throw new Error(
      '[anytime-memory] attachTrailDbFromHandle: only BetterSqlite3MemoryDb is supported for trailHandle',
    );
  }
  const tempPath = path.join(
    os.tmpdir(),
    `memory-core-trail-attach-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.db`,
  );
  fs.writeFileSync(tempPath, trailHandle.serialize());
  db.attach(tempPath, 'trail', true);
}
