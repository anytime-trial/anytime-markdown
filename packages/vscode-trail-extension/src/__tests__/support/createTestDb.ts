// TrailDatabase のテスト用ファクトリ。
// trail-db パッケージの InMemoryTrailStorage を使い、ディスク I/O なしの
// 安全なインスタンスを返す。Phase 1 (sql.js → better-sqlite3 移行) 以降、
// init() がそのまま使えるため sql.js の直接 require は不要。

import { TrailDatabase, InMemoryTrailStorage } from '@anytime-markdown/trail-db';
import type { DbLogger } from '@anytime-markdown/trail-db';

export async function createTestTrailDatabase(logger?: DbLogger): Promise<TrailDatabase> {
  const db = new TrailDatabase('/tmp', new InMemoryTrailStorage(), undefined, logger);
  await db.init();
  return db;
}
