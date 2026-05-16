import * as fs from 'node:fs';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { SqlJsCompatStatement } from './SqlJsCompatStatement';

export interface SqlJsCompatExecResult {
  columns: string[];
  values: unknown[][];
}

/**
 * sql.js `Database` の API サブセットを better-sqlite3 上で再現する shim。
 *
 * 目的: trail-db / mcp-trail などで 393 箇所以上ある `db.run / db.exec /
 * db.prepare / stmt.bind/step/get` パターンを書き換えずに、ドライバだけ
 * better-sqlite3 へ差し替える。
 *
 * 制約:
 * - 内部状態は同期。sql.js の async 初期化は呼び出し側で TrailDatabase.init() が
 *   ラップする。
 * - export() は in-memory DB の場合 `inner.serialize()`、file-backed の場合は
 *   `filePath` から `fs.readFileSync` で読み出す (better-sqlite3 は書き込み済の
 *   ファイル状態を返す)。
 */
export class SqlJsCompatDatabase {
  private lastChanges = 0;

  constructor(
    private readonly inner: BetterSqlite3Database,
    private readonly filePath: string | null = null,
  ) {}

  /**
   * `db.exec(sql, params?)` の sql.js 互換実装。
   *
   * - 単一 SELECT/PRAGMA/WITH/EXPLAIN: `[{ columns, values }]` を返す
   * - 単一 DDL/INSERT/UPDATE/DELETE: `[]` を返し、changes を記録
   * - 複数 statement の SQL: `db.exec()` でまとめて実行し `[]` を返す
   */
  exec(sql: string, params?: readonly unknown[]): SqlJsCompatExecResult[] {
    const normalized = params ? normalizeParams(params) : [];

    if (normalized.length === 0 && isMultiStatement(sql)) {
      this.inner.exec(sql);
      return [];
    }

    const stmt = this.inner.prepare(sql);

    if (!stmt.reader) {
      const info = stmt.run(...normalized);
      this.lastChanges = info.changes;
      return [];
    }

    const cols = stmt.columns();
    const rows = stmt.raw().all(...normalized) as unknown[][];
    return [
      {
        columns: cols.map((c) => c.name),
        values: rows,
      },
    ];
  }

  /**
   * `db.run(sql, params?)` の sql.js 互換実装。戻り値なし。
   * 複数 statement DDL もサポート (パラメータ無しの場合のみ)。
   */
  run(sql: string, params?: readonly unknown[]): void {
    const normalized = params ? normalizeParams(params) : [];

    if (normalized.length === 0 && isMultiStatement(sql)) {
      this.inner.exec(sql);
      return;
    }

    const stmt = this.inner.prepare(sql);
    if (!stmt.reader) {
      const info = stmt.run(...normalized);
      this.lastChanges = info.changes;
    } else {
      // SELECT を run() に渡す呼び出し: better-sqlite3 では prepared SELECT を
      // .run() できないので、結果を捨てて all() を回す。
      stmt.all(...normalized);
    }
  }

  prepare(sql: string): SqlJsCompatStatement {
    return new SqlJsCompatStatement(this.inner.prepare(sql), (n) => {
      this.lastChanges = n;
    });
  }

  getRowsModified(): number {
    return this.lastChanges;
  }

  /**
   * DB の現在状態をバイト列として返す。
   * - in-memory (`:memory:`) → `inner.serialize()` を呼ぶ
   * - file-backed → ファイルから読み出す (better-sqlite3 は WAL ジャーナルを
   *   除き、メイン DB ファイルは常に最新化されている)
   */
  export(): Uint8Array {
    if (this.filePath) {
      return fs.readFileSync(this.filePath);
    }
    return this.inner.serialize();
  }

  close(): void {
    this.inner.close();
  }

  /**
   * 下位の better-sqlite3 Database を直接参照したい場合に使う。
   * 互換 shim を介さない高速パスが必要な call site のためのエスケープハッチ。
   */
  get raw(): BetterSqlite3Database {
    return this.inner;
  }
}

function normalizeParams(params: readonly unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}

/**
 * 与えられた SQL に複数の statement が含まれているかを大雑把に判定する。
 * 文字列リテラル・コメントを除去した後で `;` の後ろに非空白文字があれば複数。
 *
 * 完全なパーサではないが、trail-db / mcp-trail の現用ケースは全てカバーできる
 * (`CREATE TABLE ...; CREATE INDEX ...; PRAGMA ...;` 等)。
 */
function isMultiStatement(sql: string): boolean {
  const stripped = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^']|'')*'/g, '')
    .replace(/"(?:[^"]|"")*"/g, '');
  return /;\s*\S/.test(stripped);
}
