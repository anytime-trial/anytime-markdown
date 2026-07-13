import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3MemoryDb } from './connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from './connection/types';

export interface AttachTrailDbFromHandleResult {
  readonly tempDir: string;
  readonly tempPath: string;
  cleanup(): void;
}

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
    throw new TypeError(
      '[anytime-memory] attachTrailDbReadOnly: only BetterSqlite3MemoryDb is supported',
    );
  }
  db.attach(trailDbPath, 'trail', true);
}

/**
 * Attach an already-open BetterSqlite3MemoryDb (in-memory or file) as `trail`.
 *
 * テスト便宜のため `:memory:` で構築した trail handle をそのまま attach できるよう
 * `serialize()` で一時ファイルに書き出してから attach する (テスト時のみの利用想定)。
 * 一時ディレクトリは attach 直後に削除する — POSIX では open 済み fd が unlink 後も
 * 有効なため読み取りは壊れない (Windows 非対応だが本関数はテスト専用)。
 *
 * @deprecated 新規コードは `attachTrailDbReadOnly(db, trailDbPath)` を直接使うこと。
 */
export function attachTrailDbFromHandle(
  db: MemoryDbConnection,
  trailHandle: MemoryDbConnection,
): AttachTrailDbFromHandleResult {
  if (!(db instanceof BetterSqlite3MemoryDb)) {
    throw new TypeError(
      '[anytime-memory] attachTrailDbFromHandle: only BetterSqlite3MemoryDb is supported for main db',
    );
  }
  if (!(trailHandle instanceof BetterSqlite3MemoryDb)) {
    throw new TypeError(
      '[anytime-memory] attachTrailDbFromHandle: only BetterSqlite3MemoryDb is supported for trailHandle',
    );
  }
  // mkdtempSync で OS-secure な乱数ディレクトリを作成し、その配下に固定ファイル名で書く。
  // CodeQL `js/insecure-temporary-file` の対象 (Math.random / Date.now / pid 組合せ) を回避する。
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-core-trail-attach-'));
  const tempPath = path.join(tempDir, 'trail.db');
  const cleanup = (): void => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
  try {
    fs.writeFileSync(tempPath, trailHandle.serialize(), { mode: 0o600 });
    db.attach(tempPath, 'trail', true);
  } catch (error) {
    cleanup();
    throw error;
  }
  cleanup();
  return { tempDir, tempPath, cleanup };
}
