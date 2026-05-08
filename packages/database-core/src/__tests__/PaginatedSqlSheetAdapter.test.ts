import { PaginatedSqlSheetAdapter } from '../PaginatedSqlSheetAdapter';
import type { DatabaseAdapter } from '../DatabaseAdapter';
import type { QueryResult, SchemaInfo, DatabaseCapabilities } from '../types';

function makeMockAdapter(): {
  adapter: DatabaseAdapter;
  setRows: (rows: ReadonlyArray<ReadonlyArray<string>>) => void;
} {
  let rows: ReadonlyArray<ReadonlyArray<string>> = [];
  const capabilities: DatabaseCapabilities = {
    readOnly: false,
    canTransactionalSave: true,
    canExportBytes: false,
  };
  const adapter: DatabaseAdapter = {
    id: 'sqlite-better',
    displayName: 'mock',
    capabilities,
    async listSchema(): Promise<SchemaInfo> {
      return { tables: [], views: [] };
    },
    async selectRows(): Promise<QueryResult> {
      return {
        columns: ['a', 'b'],
        rows,
        executionTimeMs: 1,
        isMutation: false,
      };
    },
    async countRows() {
      return rows.length;
    },
    async executeSql(): Promise<QueryResult> {
      throw new Error('not used');
    },
  };
  return {
    adapter,
    setRows: (next) => {
      rows = next;
    },
  };
}

describe('PaginatedSqlSheetAdapter', () => {
  it('loadPage updates snapshot with header row plus data and notifies', async () => {
    const m = makeMockAdapter();
    m.setRows([['1', 'a'], ['2', 'b']]);
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    let count = 0;
    sa.subscribe(() => (count += 1));
    await sa.loadPage(1, 25);
    // カラム名は getColumnHeaders 経由、cells は純粋にデータ行のみ
    expect(sa.getSnapshot().cells).toEqual([['1', 'a'], ['2', 'b']]);
    expect(sa.getColumnHeaders()).toEqual(['a', 'b']);
    expect(count).toBe(1);
  });

  it('readOnly is true and setCell is no-op', async () => {
    const m = makeMockAdapter();
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    expect(sa.readOnly).toBe(true);
    const before = sa.getSnapshot();
    sa.setCell(0, 0, 'X');
    expect(sa.getSnapshot()).toBe(before);
  });
});
