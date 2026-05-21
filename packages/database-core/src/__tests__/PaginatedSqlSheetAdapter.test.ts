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

  it('applySnapshot updates snapshot and notifies listeners', () => {
    const m = makeMockAdapter();
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    let count = 0;
    sa.subscribe(() => (count += 1));
    const next = { cells: [['x']], alignments: [[null]], range: { rows: 1, cols: 1 } };
    sa.applySnapshot(next);
    expect(sa.getSnapshot()).toBe(next);
    expect(count).toBe(1);
  });

  it('applyQueryResult updates snapshot and columnHeaders', () => {
    const m = makeMockAdapter();
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    let count = 0;
    sa.subscribe(() => (count += 1));
    const result: import('../types').QueryResult = {
      columns: ['col1', 'col2'],
      rows: [['v1', 'v2'], ['v3', 'v4']],
      executionTimeMs: 1,
      isMutation: false,
    };
    sa.applyQueryResult(result);
    expect(sa.getColumnHeaders()).toEqual(['col1', 'col2']);
    expect(sa.getSnapshot().cells).toEqual([['v1', 'v2'], ['v3', 'v4']]);
    expect(count).toBe(1);
  });

  it('subscribe returns unsubscribe function that stops notifications', async () => {
    const m = makeMockAdapter();
    m.setRows([['1', 'a']]);
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    let count = 0;
    const unsub = sa.subscribe(() => (count += 1));
    await sa.loadPage(1, 10);
    expect(count).toBe(1);
    unsub();
    await sa.loadPage(1, 10);
    expect(count).toBe(1); // no additional notification after unsub
  });

  it('replaceAll is no-op and does not change snapshot', () => {
    const m = makeMockAdapter();
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    const before = sa.getSnapshot();
    sa.replaceAll({ cells: [['X']], alignments: [[null]], range: { rows: 1, cols: 1 } });
    expect(sa.getSnapshot()).toBe(before);
  });

  it('applyText is no-op', () => {
    const m = makeMockAdapter();
    const sa = new PaginatedSqlSheetAdapter({
      databaseAdapter: m.adapter,
      tableName: 'users',
    });
    const before = sa.getSnapshot();
    // applyText should not throw and not change state
    expect(() => sa.applyText()).not.toThrow();
    expect(sa.getSnapshot()).toBe(before);
  });
});
