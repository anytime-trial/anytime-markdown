import type BetterSqlite3 from 'better-sqlite3';
import { loadBetterSqlite3 } from './loadBetterSqlite3';
import type {
  ExecResultColumn,
  MemoryDbConnection,
  MemoryDbStatement,
  RowObject,
  RunResult,
  SqlValue,
} from './types';

export interface BetterSqlite3MemoryDbOptions {
  readonly filePath: string;
  readonly readOnly?: boolean;
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * VS Code 拡張のように bundled された環境では指定推奨
   * (database-core/BetterSqlite3Adapter と同じパターン)。
   */
  readonly nativeBinding?: string;
}

export class BetterSqlite3MemoryDb implements MemoryDbConnection {
  private readonly db: BetterSqlite3.Database;
  private lastRunChanges = 0;

  constructor(opts: BetterSqlite3MemoryDbOptions) {
    const Ctor = loadBetterSqlite3();
    this.db = new Ctor(opts.filePath, {
      readonly: opts.readOnly ?? false,
      fileMustExist: false,
      ...(opts.nativeBinding ? { nativeBinding: opts.nativeBinding } : {}),
    });
  }

  static openInMemory(): BetterSqlite3MemoryDb {
    return new BetterSqlite3MemoryDb({ filePath: ':memory:' });
  }

  exec(sql: string, params?: ReadonlyArray<SqlValue>): ExecResultColumn[] {
    const stmt = this.db.prepare(sql);
    if (!stmt.reader) {
      const result = stmt.run(...(toBindArgs(params) as unknown[]));
      this.lastRunChanges = Number(result.changes);
      return [];
    }
    const rows = stmt.all(...(toBindArgs(params) as unknown[])) as Record<string, SqlValue>[];
    const columns = stmt.columns().map((c) => c.name);
    const values = rows.map((row) => columns.map((c) => (row[c] === undefined ? null : row[c])));
    return [{ columns, values }];
  }

  run(sql: string, params?: ReadonlyArray<SqlValue>): void {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(toBindArgs(params) as unknown[]));
    this.lastRunChanges = Number(result.changes);
  }

  execMany(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): MemoryDbStatement {
    const stmt = this.db.prepare(sql);
    const trackChanges = (changes: number): void => {
      this.lastRunChanges = changes;
    };
    return {
      all(...params: SqlValue[]): RowObject[] {
        return stmt.all(...(params as unknown[])) as RowObject[];
      },
      get(...params: SqlValue[]): RowObject | undefined {
        return stmt.get(...(params as unknown[])) as RowObject | undefined;
      },
      run(...params: SqlValue[]): RunResult {
        const r = stmt.run(...(params as unknown[]));
        trackChanges(Number(r.changes));
        return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
      },
      *iterate(...params: SqlValue[]): IterableIterator<RowObject> {
        for (const row of stmt.iterate(...(params as unknown[]))) yield row as RowObject;
      },
    };
  }

  getRowsModified(): number {
    return this.lastRunChanges;
  }

  pragma(name: string): unknown {
    return this.db.pragma(name);
  }

  attach(filePath: string, alias: string, readOnly = false): void {
    // ファイル名にシングルクォートが含まれるとエスケープが必要。SQLite の文字列リテラル仕様
    // (シングルクォート 2 個でエスケープ) に従う。
    const escaped = filePath.replace(/'/g, "''");
    // 注意: better-sqlite3 はデフォルトで SQLITE_OPEN_URI を有効にしていないため
    // `?mode=ro` のような URI 引数はファイル名の一部として扱われ、その名前で
    // 空 DB が新規作成される。read-only を要求する場合は URI ではなく
    // 接続全体を read-only で開くか、アプリ層でガードする (installTrailReadonlyGuard
    // 相当の write 阻止) のいずれか。ここでは plain ATTACH に留めて
    // readOnly フラグは「呼び出し側の意図表明」としてだけ受け取る。
    this.db.exec(`ATTACH DATABASE '${escaped}' AS ${alias}`);
    if (readOnly) {
      // SQLite の query_only は接続単位なので main DB の write もブロックしてしまう。
      // ここではあえて何もしない。書き込み禁止は呼び出し側の責務とする (将来的に
      // installTrailReadonlyGuard 相当を better-sqlite3 にも実装する余地あり)。
    }
  }

  detach(alias: string): void {
    this.db.exec(`DETACH DATABASE ${alias}`);
  }

  close(): void {
    this.db.close();
  }
}

function toBindArgs(params?: ReadonlyArray<SqlValue>): ReadonlyArray<SqlValue> {
  if (!params) return [];
  return params.map((v) => {
    // better-sqlite3 は undefined を NULL として扱わずエラーにするため、null に正規化
    if (v === undefined) return null as SqlValue;
    return v;
  });
}
