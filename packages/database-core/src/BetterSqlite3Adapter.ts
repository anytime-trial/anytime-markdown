import type Database from 'better-sqlite3';
import type { DatabaseAdapter } from './DatabaseAdapter';
import type {
  ColumnInfo,
  DatabaseCapabilities,
  OpenMode,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from './types';
import { assertSafeIdentifier } from './identifier';
import { isMutationSql } from './sqlMutationCheck';

export interface BetterSqlite3AdapterOptions {
  readonly filePath: string;
  readonly openMode: OpenMode;
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * 指定すると bindings パッケージの探索を回避する (Node 24 で stack trace 互換性
   * の問題があるため、VS Code 拡張のような bundled 環境では明示推奨)。
   */
  readonly nativeBinding?: string;
}

export class BetterSqlite3Adapter implements DatabaseAdapter {
  readonly id = 'sqlite-better' as const;
  readonly displayName: string;
  readonly capabilities: DatabaseCapabilities;
  private db: Database.Database;
  private inTransaction = false;

  constructor(opts: BetterSqlite3AdapterOptions) {
    this.displayName = `SQLite (${opts.filePath})`;
    const readonly = opts.openMode === 'readonly';
    // 遅延 require: VS Code 拡張のように bundle された環境では、
    // モジュール先頭で static import すると require 解決パスが不安定になるため
    // コンストラクタ内で require する
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const DatabaseCtor = require('better-sqlite3') as typeof Database;
    this.db = new DatabaseCtor(opts.filePath, {
      readonly,
      fileMustExist: true,
      ...(opts.nativeBinding ? { nativeBinding: opts.nativeBinding } : {}),
    });
    this.capabilities = {
      readOnly: readonly,
      canTransactionalSave: !readonly,
      canExportBytes: false,
    };
    if (!readonly) {
      this.db.exec('PRAGMA journal_mode = WAL');
      this.beginTransaction();
    }
  }

  private beginTransaction(): void {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    this.inTransaction = true;
  }

  async listSchema(): Promise<SchemaInfo> {
    const masterRows = this.db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all() as ReadonlyArray<{ name: string; type: string }>;

    const tables: TableInfo[] = [];
    const views: TableInfo[] = [];

    for (const r of masterRows) {
      const safe = assertSafeIdentifier(r.name);
      const colRows = this.db.pragma(`table_info("${safe}")`) as ReadonlyArray<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;
      const columns: ColumnInfo[] = colRows.map((c) => ({
        name: c.name,
        type: c.type,
        notNull: c.notnull === 1,
        primaryKey: c.pk === 1,
      }));
      const info: TableInfo = { name: safe, columns };
      if (r.type === 'table') tables.push(info);
      else views.push(info);
    }

    return { tables, views };
  }

  async selectRows(p: {
    table: string;
    limit: number;
    offset: number;
  }): Promise<QueryResult> {
    const safe = assertSafeIdentifier(p.table);
    const start = performance.now();
    const stmt = this.db.prepare(`SELECT * FROM "${safe}" LIMIT ? OFFSET ?`);
    const rowsRaw = stmt.all(p.limit, p.offset) as ReadonlyArray<Record<string, unknown>>;
    const columns = stmt.columns().map((c) => c.name);
    const rows = rowsRaw.map((r) => columns.map((c) => formatCell(r[c])));
    return {
      columns,
      rows,
      executionTimeMs: performance.now() - start,
      isMutation: false,
    };
  }

  async countRows(table: string): Promise<number> {
    const safe = assertSafeIdentifier(table);
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${safe}"`).get() as { n: number };
    return row.n;
  }

  async executeSql(sql: string): Promise<QueryResult> {
    const isWrite = isMutationSql(sql);
    if (this.capabilities.readOnly && isWrite) {
      throw new Error('database is opened in read-only mode');
    }

    const start = performance.now();
    const stmt = this.db.prepare(sql);

    if (stmt.reader) {
      const rowsRaw = stmt.all() as ReadonlyArray<Record<string, unknown>>;
      const columns = stmt.columns().map((c) => c.name);
      const rows = rowsRaw.map((r) => columns.map((c) => formatCell(r[c])));
      return {
        columns,
        rows,
        executionTimeMs: performance.now() - start,
        isMutation: false,
      };
    }

    const result = stmt.run();
    return {
      columns: [],
      rows: [],
      rowsAffected: result.changes,
      executionTimeMs: performance.now() - start,
      isMutation: true,
    };
  }

  async save(): Promise<void> {
    if (!this.inTransaction) return;
    this.db.exec('COMMIT');
    this.inTransaction = false;
    this.beginTransaction();
  }

  async revert(): Promise<void> {
    if (!this.inTransaction) return;
    this.db.exec('ROLLBACK');
    this.inTransaction = false;
    this.beginTransaction();
  }

  async dispose(): Promise<void> {
    if (this.inTransaction) {
      this.db.exec('ROLLBACK');
      this.inTransaction = false;
    }
    this.db.close();
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Uint8Array) return `<BLOB:${v.byteLength}b>`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
