// __non_webpack_require__ はwebpackグローバル。テスト環境ではsql-asm.jsを直接ロードするよう差し替え
const sqlAsmActual = require('/anytime-markdown/node_modules/sql.js/dist/sql-asm.js'); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

import { TrailDatabase } from '../TrailDatabase';

describe('TrailDatabase.getLastImportedAt', () => {
  it('セッションがない場合はnullを返す', async () => {
    // DB_PATH はハードコードされているため、init() をモックして空のインメモリDBを使用する
    const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
    const SQL = await initSqlJs();
    const inMemoryDb = new SQL.Database();

    const db = new TrailDatabase('/tmp');
    // private フィールドに直接アクセスして空DBをセット
    (db as unknown as Record<string, unknown>).db = inMemoryDb;
    // createTables を呼び出すためにprotected メソッドにアクセス
    (db as unknown as Record<string, () => void>).createTables();

    const result = db.getLastImportedAt();
    expect(result).toBeNull();
    db.close();
  });
});
