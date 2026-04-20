// TrailDatabase のテスト用ファクトリ。
//
// TrailDatabase を直接 new すると以下の危険がある。
//   - 第1引数 distPath はストレージパスではない（sql-asm.js の場所）
//   - 第2引数 storageDir を省略すると ~/.claude/trail にフォールバックする
//   - CRUD メソッドは内部で this.save() → fs.writeFileSync(this.dbPath, ...) を呼ぶ
// → テスト中に本番 DB を上書きする事故につながる（2026-04-20 に発生）
//
// このファクトリは以下を保証する。
//   - in-memory SQL.js DB を注入
//   - save() メソッドを no-op に差し替え
//   - createTables() を実行してスキーマ適用
// これを経由する限り、テストが本番パスに書き込むことはない。

import { TrailDatabase } from '../../TrailDatabase';

// ts-jest + CommonJS のため require で直接読み込む
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqlAsmActual = require('/anytime-markdown/node_modules/sql.js/dist/sql-asm.js');

export async function createTestTrailDatabase(): Promise<TrailDatabase> {
  const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
  const SQL = await initSqlJs();
  const inMemoryDb = new SQL.Database();

  // 第1引数 '/tmp' は distPath（sql-asm.js の場所）として渡す。
  // この値はファイル I/O には使われない（既に SQL.js はロード済み）。
  const db = new TrailDatabase('/tmp');

  // in-memory DB を private フィールドに注入
  (db as unknown as Record<string, unknown>).db = inMemoryDb;

  // save() を no-op 化: CRUD メソッドが内部で呼ぶ this.save() が
  // fs.writeFileSync(this.dbPath, ...) を実行し本番 DB を上書きするのを防ぐ。
  // Phase 0 で TrailDatabase.save() 自体にもガードを追加済みだが、
  // ここでの差し替えはガードが発動する前に I/O を完全に回避する。
  (db as unknown as Record<string, () => void>).save = () => {
    /* no-op for tests */
  };

  // スキーマを適用（CREATE TABLE IF NOT EXISTS ...）
  (db as unknown as Record<string, () => void>).createTables();

  return db;
}
