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

const attachedTempDirs = new WeakMap<
  BetterSqlite3MemoryDb,
  Array<{ alias: string; cleanup: () => void }>
>();
const patchedDbs = new WeakSet<BetterSqlite3MemoryDb>();

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
 * `serialize()` で一時ファイルに書き出してから attachTrailDbReadOnly() を呼ぶ。
 * 残された一時ファイルは OS の tmpdir 掃除に任せる (テスト時のみの利用想定)。
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
  fs.writeFileSync(tempPath, trailHandle.serialize(), { mode: 0o600 });
  db.attach(tempPath, 'trail', true);
  const cleanup = (): void => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
  registerAttachCleanup(db, 'trail', cleanup);
  cleanup();
  return { tempDir, tempPath, cleanup };
}

function registerAttachCleanup(
  db: BetterSqlite3MemoryDb,
  alias: string,
  cleanup: () => void,
): void {
  const cleanups = attachedTempDirs.get(db) ?? [];
  cleanups.push({ alias, cleanup });
  attachedTempDirs.set(db, cleanups);
  patchDbCleanup(db);
}

function runAttachCleanups(db: BetterSqlite3MemoryDb, alias?: string): void {
  const cleanups = attachedTempDirs.get(db);
  if (!cleanups) return;
  const remaining: Array<{ alias: string; cleanup: () => void }> = [];
  for (const entry of cleanups) {
    if (alias === undefined || entry.alias === alias) {
      entry.cleanup();
    } else {
      remaining.push(entry);
    }
  }
  if (remaining.length === 0) {
    attachedTempDirs.delete(db);
  } else {
    attachedTempDirs.set(db, remaining);
  }
}

function patchDbCleanup(db: BetterSqlite3MemoryDb): void {
  if (patchedDbs.has(db)) return;
  patchedDbs.add(db);
  const originalDetach = db.detach.bind(db);
  const originalClose = db.close.bind(db);

  db.detach = (alias: string): void => {
    try {
      originalDetach(alias);
    } finally {
      runAttachCleanups(db, alias);
    }
  };

  db.close = (): void => {
    try {
      originalClose();
    } finally {
      runAttachCleanups(db);
    }
  };
}
