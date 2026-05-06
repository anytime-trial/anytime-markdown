import type {
  SchemaInfo,
  QueryResult,
  DatabaseCapabilities,
} from './types';

export interface DatabaseAdapter {
  readonly id: 'sqlite-better' | 'sqlite-sqljs' | 'sqlite-remote';
  readonly displayName: string;
  readonly capabilities: DatabaseCapabilities;

  listSchema(): Promise<SchemaInfo>;
  selectRows(p: { table: string; limit: number; offset: number }): Promise<QueryResult>;
  countRows(table: string): Promise<number>;
  executeSql(sql: string): Promise<QueryResult>;

  save?(): Promise<void>;
  revert?(): Promise<void>;
  exportBytes?(): Uint8Array;

  dispose?(): Promise<void>;
}
