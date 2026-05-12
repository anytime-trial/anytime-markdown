import type { BindParams, Database, SqlJsStatic } from 'sql.js';
import { loadSqlJsModule } from '../sqlJsLoader';
import type {
  ExecResultColumn,
  MemoryDbConnection,
  MemoryDbStatement,
  RowObject,
  RunResult,
  SqlValue,
} from './types';

export class SqlJsMemoryDb implements MemoryDbConnection {
  private constructor(private readonly db: Database) {}

  static async openInMemory(): Promise<SqlJsMemoryDb> {
    const SQL: SqlJsStatic = await loadSqlJsModule();
    return new SqlJsMemoryDb(new SQL.Database());
  }

  static async openFromBytes(bytes: Uint8Array): Promise<SqlJsMemoryDb> {
    const SQL: SqlJsStatic = await loadSqlJsModule();
    return new SqlJsMemoryDb(new SQL.Database(bytes));
  }

  /** 既存の sql.js Database インスタンスを wrap する (テスト・移行用)。 */
  static fromDatabase(db: Database): SqlJsMemoryDb {
    return new SqlJsMemoryDb(db);
  }

  /** 内部の sql.js Database を取得する (attach.ts 等の sql.js 固有 API 用)。 */
  getRawDb(): Database {
    return this.db;
  }

  exec(sql: string, params?: ReadonlyArray<SqlValue>): ExecResultColumn[] {
    const bind = params ? (toBindArgs(params) as BindParams) : undefined;
    const result = this.db.exec(sql, bind) as unknown as ExecResultColumn[];
    if (result.length > 0) return result;

    // sql.js は 0 行 SELECT の場合も空配列を返すため、SELECT/PRAGMA/WITH 系は
    // columns だけ補完して BetterSqlite3MemoryDb と挙動を揃える。
    const trimmed = sql.trim().toLowerCase();
    if (
      trimmed.startsWith('select') ||
      trimmed.startsWith('with') ||
      trimmed.startsWith('pragma')
    ) {
      const stmt = this.db.prepare(sql);
      try {
        const columns = stmt.getColumnNames();
        if (columns.length > 0) return [{ columns, values: [] }];
      } finally {
        stmt.free();
      }
    }
    return [];
  }

  run(sql: string, params?: ReadonlyArray<SqlValue>): void {
    this.db.run(sql, params ? (toBindArgs(params) as BindParams) : undefined);
  }

  execMany(sql: string): void {
    this.db.run(sql);
  }

  prepare(sql: string): MemoryDbStatement {
    const stmt = this.db.prepare(sql);
    const db = this.db;
    return {
      all(...params: SqlValue[]): RowObject[] {
        const rows: RowObject[] = [];
        stmt.bind(toBindArgs(params) as BindParams);
        while (stmt.step()) rows.push(stmt.getAsObject() as RowObject);
        stmt.reset();
        return rows;
      },
      get(...params: SqlValue[]): RowObject | undefined {
        stmt.bind(toBindArgs(params) as BindParams);
        const ok = stmt.step();
        if (!ok) {
          stmt.reset();
          return undefined;
        }
        const row = stmt.getAsObject() as RowObject;
        stmt.reset();
        return row;
      },
      run(...params: SqlValue[]): RunResult {
        stmt.bind(toBindArgs(params) as BindParams);
        stmt.step();
        stmt.reset();
        return { changes: db.getRowsModified(), lastInsertRowid: 0 };
      },
      *iterate(...params: SqlValue[]): IterableIterator<RowObject> {
        stmt.bind(toBindArgs(params) as BindParams);
        while (stmt.step()) yield stmt.getAsObject() as RowObject;
        stmt.reset();
      },
      free(): void {
        stmt.free();
      },
    };
  }

  getRowsModified(): number {
    return this.db.getRowsModified();
  }

  pragma(name: string): unknown {
    const r = this.db.exec(`PRAGMA ${name}`);
    return r[0]?.values ?? [];
  }

  attach(filePath: string, alias: string, readOnly = false): void {
    const mode = readOnly ? '?mode=ro' : '';
    const escaped = filePath.replace(/'/g, "''");
    this.db.run(`ATTACH DATABASE '${escaped}${mode}' AS ${alias}`);
  }

  detach(alias: string): void {
    this.db.run(`DETACH DATABASE ${alias}`);
  }

  close(): void {
    this.db.close();
  }

  save(): void {
    // sql.js のバイト列書き出しは呼出側責務 (openMemoryCoreDb の save() が exportBytes() を経由)
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }
}

function toBindArgs(
  params: ReadonlyArray<SqlValue>,
): Array<string | number | Uint8Array | null> {
  return params.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'bigint') return Number(v);
    return v;
  });
}
