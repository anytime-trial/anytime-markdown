// TrailDatabase のテスト用ファクトリ。
//
// InMemoryTrailStorage を注入することで、テスト中の本番 DB 上書き事故 (2026-04-20) を
// 構造的に防いでいる。Phase 1 (sql.js 撤去) で内部ドライバが better-sqlite3 になっても
// この方針は変わらない。
//
//   - readInitialBytes(): 常に null
//   - getFilePath(): null → better-sqlite3 は `:memory:` で開く
//   - save(): no-op
//
// init() がそのまま使えるため、sql.js 時代のように内部 db を後付けで差し込む必要は
// なくなった。

import { TrailDatabase, InMemoryTrailStorage } from '../../TrailDatabase';
import type { DbLogger } from '../../DbLogger';

export async function createTestTrailDatabase(logger?: DbLogger): Promise<TrailDatabase> {
  const db = new TrailDatabase('/tmp', new InMemoryTrailStorage(), undefined, logger);
  await db.init();
  return db;
}

/**
 * init() を呼ばない未初期化インスタンス。ensureDb() の「init 前に呼ぶと throw」ガードを
 * テストする用途。本番 DB 上書き事故防止のため InMemoryTrailStorage を注入する。
 */
export function createUninitializedTestDb(): TrailDatabase {
  return new TrailDatabase('/tmp', new InMemoryTrailStorage());
}

/**
 * storage インスタンスを注入する未初期化インスタンス。storage の save/export 挙動そのものを
 * 検証する用途（init/save/close はテスト側が駆動する）。FileTrailStorage を渡す場合は
 * 呼び出し側が用意した一時ディレクトリ（os.tmpdir 配下）のパスを使うこと（本番パス禁止）。
 */
export function createStorageBackedTestDb(
  storage: ConstructorParameters<typeof TrailDatabase>[1],
  logger?: DbLogger,
): TrailDatabase {
  return new TrailDatabase('/tmp', storage, undefined, logger);
}

/**
 * 文字列 storageDir を渡す FileTrailStorage 分岐をテストする用途。storageDir は呼び出し側が
 * 用意した一時ディレクトリ（os.tmpdir 配下）を渡すこと（本番パス禁止）。
 */
export async function createFileBackedTestDb(storageDir: string): Promise<TrailDatabase> {
  const db = new TrailDatabase('/tmp', storageDir);
  await db.init();
  return db;
}
