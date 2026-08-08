export type SqlValue = number | string | Uint8Array | bigint | null;

export interface RowObject {
  readonly [column: string]: SqlValue;
}

export interface ExecResultColumn {
  readonly columns: ReadonlyArray<string>;
  readonly values: ReadonlyArray<ReadonlyArray<SqlValue>>;
}

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface MemoryDbStatement {
  all(...params: SqlValue[]): RowObject[];
  get(...params: SqlValue[]): RowObject | undefined;
  run(...params: SqlValue[]): RunResult;
  iterate(...params: SqlValue[]): IterableIterator<RowObject>;
  free?(): void;
}

export interface MemoryDbConnection {
  exec(sql: string, params?: ReadonlyArray<SqlValue>): ExecResultColumn[];
  run(sql: string, params?: ReadonlyArray<SqlValue>): void;
  execMany(sql: string): void;
  prepare(sql: string): MemoryDbStatement;
  getRowsModified(): number;
  pragma(name: string): unknown;
  attach(filePath: string, alias: string, readOnly?: boolean): void;
  detach(alias: string): void;
  close(): void;
  save?(): void;
}
