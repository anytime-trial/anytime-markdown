// TrailDatabase のテスト用ファクトリ。
//
// TrailDatabase を直接 new すると以下の危険がある。
//   - 第1引数 distPath はストレージパスではない（sql-asm.js の場所）
//   - 第2引数 storageDir を省略すると ~/.claude/trail にフォールバックする
//   - CRUD メソッドは内部で this.save() → fs.writeFileSync(this.dbPath, ...) を呼ぶ
// → テスト中に本番 DB を上書きする事故につながる（2026-04-20 に発生）
//
// Phase 2.1 でストレージ戦略パターンを導入したため、
// 本ファクトリは InMemoryTrailStorage を注入するだけで安全になる。
//   - readInitialBytes(): 常に null → 新規 SQL.Database を作成
//   - save(): no-op → ディスク I/O は一切発生しない
// 追加のフィールド差し替えは不要。

import { TrailDatabase, InMemoryTrailStorage } from '../../TrailDatabase';

// ts-jest + CommonJS のため require で直接読み込む
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqlAsmActual = require('/anytime-markdown/node_modules/sql.js/dist/sql-asm.js');

export async function createTestTrailDatabase(): Promise<TrailDatabase> {
  const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
  const SQL = await initSqlJs();
  const inMemoryDb = new SQL.Database();

  // InMemoryTrailStorage を注入すれば save() は no-op、
  // readInitialBytes() は null を返すため新規 DB として動作する。
  const db = new TrailDatabase('/tmp', new InMemoryTrailStorage());

  // init() は sql-asm を __non_webpack_require__ で読むためテストでは使えない。
  // 直接読み込んだ SQL.js DB を private フィールドに注入し、createTables を実行。
  (db as unknown as Record<string, unknown>).db = inMemoryDb;
  (db as unknown as Record<string, () => void>).createTables();

  return db;
}
