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
