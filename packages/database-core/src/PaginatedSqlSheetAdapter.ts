import type {
  CellAlign,
  SheetAdapter,
  SheetSnapshot,
} from '@anytime-markdown/spreadsheet-core';
import type { DatabaseAdapter } from './DatabaseAdapter';
import type { QueryResult } from './types';

export interface PaginatedSqlSheetAdapterOptions {
  readonly databaseAdapter: DatabaseAdapter;
  readonly tableName: string;
}

const EMPTY_SNAPSHOT: SheetSnapshot = {
  cells: [],
  alignments: [],
  range: { rows: 0, cols: 0 },
};

export class PaginatedSqlSheetAdapter implements SheetAdapter {
  readonly readOnly = true;
  private snapshot: SheetSnapshot = EMPTY_SNAPSHOT;
  private columnHeaders: ReadonlyArray<string> = [];
  private readonly listeners = new Set<() => void>();
  private readonly adapter: DatabaseAdapter;
  private readonly tableName: string;

  constructor(opts: PaginatedSqlSheetAdapterOptions) {
    this.adapter = opts.databaseAdapter;
    this.tableName = opts.tableName;
  }

  getSnapshot(): SheetSnapshot {
    return this.snapshot;
  }

  getColumnHeaders(): ReadonlyArray<string> {
    return this.columnHeaders;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setCell(_row: number, _col: number, _value: string): void {
    // no-op (read-only)
  }

  replaceAll(_next: SheetSnapshot): void {
    // no-op (read-only)
  }

  applySnapshot(next: SheetSnapshot): void {
    this.snapshot = next;
    this.notify();
  }

  applyText(): void {
    // no-op
  }

  async loadPage(page: number, pageSize: number): Promise<void> {
    const result = await this.adapter.selectRows({
      table: this.tableName,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    this.applyResult(result);
  }

  applyQueryResult(result: QueryResult): void {
    this.applyResult(result);
  }

  private applyResult(r: QueryResult): void {
    this.columnHeaders = r.columns;
    this.snapshot = toSnapshot(r);
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

function toSnapshot(r: QueryResult): SheetSnapshot {
  // カラム名は SheetAdapter.getColumnHeaders 経由で SpreadsheetGrid の列ヘッダ
  // (A/B/C…) に表示するため、cells には含めない
  const cells: string[][] = r.rows.map((row) => row.map((v) => v));
  const cols = r.columns.length;
  const alignments: CellAlign[][] = cells.map((row) => row.map(() => null));
  return {
    cells,
    alignments,
    range: { rows: cells.length, cols },
  };
}
