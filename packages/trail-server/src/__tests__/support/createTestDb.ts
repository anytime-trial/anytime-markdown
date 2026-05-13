// TrailDatabase のテスト用ファクトリ。
// trail-db パッケージの InMemoryTrailStorage を使い、ディスク I/O なしの安全なインスタンスを返す。

import { TrailDatabase, InMemoryTrailStorage } from '@anytime-markdown/trail-db';
import type { DbLogger } from '@anytime-markdown/trail-db';

// ts-jest + CommonJS のため require で直接読み込む
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js'));

export async function createTestTrailDatabase(logger?: DbLogger): Promise<TrailDatabase> {
  const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
  const SQL = await initSqlJs();
  const inMemoryDb = new SQL.Database();

  const db = new TrailDatabase('/tmp', new InMemoryTrailStorage(), undefined, logger);

  (db as unknown as Record<string, unknown>).db = inMemoryDb;
  (db as unknown as Record<string, () => void>).createTables();

  return db;
}
