import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import type { DatabaseAdapter } from './DatabaseAdapter';
import type {
  ColumnInfo,
  DatabaseCapabilities,
  ForeignKeyInfo,
  OpenMode,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from './types';
import { assertSafeIdentifier } from './identifier';
import { isMutationSql } from './sqlMutationCheck';

export interface SqlJsAdapterOptions {
  readonly bytes: Uint8Array;
  readonly openMode: OpenMode;
  readonly locateWasm?: (file: string) => string;
}

export class SqlJsAdapter implements DatabaseAdapter {
  readonly id = 'sqlite-sqljs' as const;
  readonly displayName = 'SQLite (sql.js)';
  readonly capabilities: DatabaseCapabilities;
  private db: Database;

  static async create(opts: SqlJsAdapterOptions): Promise<SqlJsAdapter> {
    const SQL: SqlJsStatic = await initSqlJs(
      opts.locateWasm ? { locateFile: opts.locateWasm } : {},
    );
    const db = new SQL.Database(opts.bytes);
    return new SqlJsAdapter(db, opts.openMode);
  }

  private constructor(db: Database, openMode: OpenMode) {
    this.db = db;
    this.capabilities = {
      readOnly: openMode === 'readonly',
      canTransactionalSave: false,
      canExportBytes: true,
    };
  }

  async listSchema(): Promise<SchemaInfo> {
    const stmt = this.db.prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
    );
    const tables: TableInfo[] = [];
    const views: TableInfo[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name: string; type: string };
      const safe = assertSafeIdentifier(row.name);
      const columns = this.collectColumns(safe);
      const foreignKeys = row.type === 'table' ? this.collectForeignKeys(safe) : undefined;
      const info: TableInfo = foreignKeys && foreignKeys.length > 0
        ? { name: safe, columns, foreignKeys }
        : { name: safe, columns };
      if (row.type === 'table') tables.push(info);
      else views.push(info);
    }
    stmt.free();
    return { tables, views };
  }

  private collectForeignKeys(table: string): ForeignKeyInfo[] {
    const stmt = this.db.prepare(`PRAGMA foreign_key_list("${table}")`);
    // 複合 FK の場合 id ごとに seq=0,1,... の複数行が返る。
    // ER 図では 1 つの FK を 1 本の代表線として扱うため、id ごとに最後の seq
    // (通常 element/id 系のカラム) を採用する。
    const grouped = new Map<number, ForeignKeyInfo>();
    while (stmt.step()) {
      const r = stmt.getAsObject() as {
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string | null;
      };
      grouped.set(r.id, {
        fromColumn: r.from,
        toTable: r.table,
        toColumn: r.to ?? '',
      });
    }
    stmt.free();
    return [...grouped.values()];
  }

  private collectColumns(table: string): ColumnInfo[] {
    const stmt = this.db.prepare(`PRAGMA table_info("${table}")`);
    const out: ColumnInfo[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      };
      out.push({
        name: r.name,
        type: r.type,
        notNull: r.notnull === 1,
        // pk は「PK の中の順番 (1=最初, 2=2 番目...)」。0 は PK ではないことを示すので、
        // 複合 PK にも対応するため > 0 で判定する。
        primaryKey: r.pk > 0,
      });
    }
    stmt.free();
    return out;
  }

  async selectRows(p: {
    table: string;
    limit: number;
    offset: number;
  }): Promise<QueryResult> {
    const safe = assertSafeIdentifier(p.table);
    const start = performance.now();
    const stmt = this.db.prepare(`SELECT * FROM "${safe}" LIMIT ? OFFSET ?`);
    stmt.bind([p.limit, p.offset]);
    const columns = stmt.getColumnNames();
    const rows: string[][] = [];
    while (stmt.step()) {
      rows.push(stmt.get().map(formatCell));
    }
    stmt.free();
    return {
      columns,
      rows,
      executionTimeMs: performance.now() - start,
      isMutation: false,
    };
  }

  async countRows(table: string): Promise<number> {
    const safe = assertSafeIdentifier(table);
    const stmt = this.db.prepare(`SELECT COUNT(*) AS n FROM "${safe}"`);
    stmt.step();
    const row = stmt.getAsObject() as { n: number };
    stmt.free();
    return row.n;
  }

  async executeSql(sql: string): Promise<QueryResult> {
    if (this.capabilities.readOnly && isMutationSql(sql)) {
      throw new Error('database is opened in read-only mode');
    }
    const start = performance.now();
    const stmt = this.db.prepare(sql);
    const columns = stmt.getColumnNames();
    if (columns.length > 0) {
      const rows: string[][] = [];
      while (stmt.step()) rows.push(stmt.get().map(formatCell));
      stmt.free();
      return {
        columns,
        rows,
        executionTimeMs: performance.now() - start,
        isMutation: false,
      };
    }
    stmt.step();
    stmt.free();
    const changes = this.db.getRowsModified();
    return {
      columns: [],
      rows: [],
      rowsAffected: changes,
      executionTimeMs: performance.now() - start,
      isMutation: true,
    };
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }

  async dispose(): Promise<void> {
    this.db.close();
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Uint8Array) return `<BLOB:${v.byteLength}b>`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
