export interface SchemaInfo {
  readonly tables: ReadonlyArray<TableInfo>;
  readonly views: ReadonlyArray<TableInfo>;
}

export interface TableInfo {
  readonly name: string;
  readonly columns: ReadonlyArray<ColumnInfo>;
  readonly foreignKeys?: ReadonlyArray<ForeignKeyInfo>;
}

export interface ForeignKeyInfo {
  /** 自テーブル側のカラム名 */
  readonly fromColumn: string;
  /** 参照先テーブル名 */
  readonly toTable: string;
  /** 参照先カラム名 */
  readonly toColumn: string;
}

export interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly primaryKey: boolean;
}

export interface QueryResult {
  readonly columns: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly rowsAffected?: number;
  readonly executionTimeMs: number;
  readonly isMutation: boolean;
}

export interface DatabaseCapabilities {
  readonly readOnly: boolean;
  readonly canTransactionalSave: boolean;
  readonly canExportBytes: boolean;
}

export type OpenMode = 'readwrite' | 'readonly';
