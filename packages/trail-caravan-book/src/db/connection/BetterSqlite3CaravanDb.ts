import type BetterSqlite3 from 'better-sqlite3';
import { loadBetterSqlite3 } from './loadBetterSqlite3';
import type {
  ExecResultColumn,
  CaravanDbConnection,
  CaravanDbStatement,
  RowObject,
  RunResult,
  SqlValue,
} from './types';

export interface BetterSqlite3CaravanDbOptions {
  readonly filePath: string;
  readonly readOnly?: boolean;
  /**
   * better-sqlite3 の native binary (.node) への絶対パス。
   * VS Code 拡張のように bundled された環境では指定推奨
   * (database-core/BetterSqlite3Adapter と同じパターン)。
   */
  readonly nativeBinding?: string;
}

export class BetterSqlite3CaravanDb implements CaravanDbConnection {
  private readonly db: BetterSqlite3.Database;
  private lastRunChanges = 0;
  /**
   * `attach(..., readOnly=true)` で attach された schema alias の集合。
   * better-sqlite3 は SQLITE_OPEN_URI を有効化していないため `?mode=ro` URI が
   * 使えず、SQLite 層の readonly を活用できない。代替として exec/run/prepare で
   * SQL を inspect し、これらの alias に対する INSERT/UPDATE/DELETE/REPLACE を
   * アプリ層で拒否する (sql.js の installTrailReadonlyGuard と同等)。
   */
  private readonly readOnlyAliases = new Set<string>();

  constructor(opts: BetterSqlite3CaravanDbOptions) {
    const Ctor = loadBetterSqlite3();
    this.db = new Ctor(opts.filePath, {
      readonly: opts.readOnly ?? false,
      fileMustExist: false,
      ...(opts.nativeBinding ? { nativeBinding: opts.nativeBinding } : {}),
    });
  }

  private checkReadOnlyAttach(sql: string): void {
    if (this.readOnlyAliases.size === 0) return;
    // 検査するのは**書込先テーブル**だけ。文中のどこかに alias が現れるだけで拒否すると、
    // `UPDATE <main 表> ... WHERE x IN (SELECT ... FROM trail.*)` のような読み取り
    // 副問い合わせ付きの正当な書込を誤ブロックする。呼び出し側は補助機構として
    // fail-open が多く、「毎回失敗するが処理は続く」形の恒久欠落になる
    // （本番実測: backfillBugFixWorkspace が常に拒否され workspace 1,362 行が空のまま）。
    // SHORTCUT: 先頭が WITH の書込文と引用符付き schema 名 ("trail".x) は検査対象外. ceiling: 現行コードベースにその形の書込文は無い. upgrade: CTE 経由の書込を導入する時に SQL パーサベースの判定へ置き換える.
    const m = /^\s*(?:INSERT\s+(?:OR\s+[A-Za-z]+\s+)?INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+[A-Za-z]+)?|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\./i.exec(sql);
    if (m === null) return;
    const targetSchema = m[1].toLowerCase();
    for (const alias of this.readOnlyAliases) {
      if (targetSchema === alias.toLowerCase()) {
        throw new Error(
          `[anytime-memory] write to read-only attached schema '${alias}' is forbidden. SQL: ${sql.slice(0, 100)}`,
        );
      }
    }
  }

  static openInCaravan(): BetterSqlite3CaravanDb {
    return new BetterSqlite3CaravanDb({ filePath: ':memory:' });
  }

  exec(sql: string, params?: ReadonlyArray<SqlValue>): ExecResultColumn[] {
    this.checkReadOnlyAttach(sql);
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
    this.checkReadOnlyAttach(sql);
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(toBindArgs(params) as unknown[]));
    this.lastRunChanges = Number(result.changes);
  }

  execMany(sql: string): void {
    this.checkReadOnlyAttach(sql);
    this.db.exec(sql);
  }

  prepare(sql: string): CaravanDbStatement {
    this.checkReadOnlyAttach(sql);
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
    const escaped = filePath.replaceAll("'", "''");
    this.db.exec(`ATTACH DATABASE '${escaped}' AS ${alias}`);
    if (readOnly) {
      this.readOnlyAliases.add(alias);
    }
  }

  detach(alias: string): void {
    this.db.exec(`DETACH DATABASE ${alias}`);
    this.readOnlyAliases.delete(alias);
  }

  close(): void {
    this.db.close();
  }

  /**
   * DB の全内容をバイト列として返す (better-sqlite3 native `serialize()` のラッパー)。
   * テストで in-memory db のスナップショットを別接続から ATTACH する用途に使う。
   */
  serialize(): Buffer {
    return this.db.serialize();
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
