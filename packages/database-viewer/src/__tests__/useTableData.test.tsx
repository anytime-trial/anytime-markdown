import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useTableData } from '../hooks/useTableData';
import type { DatabaseAdapter } from '@anytime-markdown/database-core';

function makeAdapter(overrides: Partial<DatabaseAdapter> = {}): DatabaseAdapter {
  return {
    selectRows: jest.fn().mockResolvedValue({ columns: ['id', 'name'], rows: [['1', 'Alice']] }),
    countRows: jest.fn().mockResolvedValue(1),
    getSchema: jest.fn(),
    executeSQL: jest.fn(),
    close: jest.fn(),
    ...overrides,
  } as unknown as DatabaseAdapter;
}

describe('useTableData', () => {
  it('returns EMPTY state when adapter is null', () => {
    const { result } = renderHook(() => useTableData(null, 'users', 1, 20));
    expect(result.current.columns).toEqual([]);
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns EMPTY state when table is null', () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useTableData(adapter, null, 1, 20));
    expect(result.current.columns).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('fetches rows and updates state on success', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useTableData(adapter, 'users', 1, 20));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.columns).toEqual(['id', 'name']);
    expect(result.current.rows).toEqual([['1', 'Alice']]);
    expect(result.current.totalRows).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=true while fetching', async () => {
    let resolveRows!: (v: unknown) => void;
    const pendingRows = new Promise((r) => { resolveRows = r; });
    const adapter = makeAdapter({
      selectRows: jest.fn().mockReturnValue(pendingRows),
      countRows: jest.fn().mockResolvedValue(5),
    });

    const { result } = renderHook(() => useTableData(adapter, 'users', 1, 20));
    // should be loading while pending
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveRows({ columns: ['id'], rows: [['1']] });
      await pendingRows;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.columns).toEqual(['id']);
  });

  it('sets error state on fetch failure', async () => {
    const adapter = makeAdapter({
      selectRows: jest.fn().mockRejectedValue(new Error('DB error')),
      countRows: jest.fn().mockResolvedValue(0),
    });

    const { result } = renderHook(() => useTableData(adapter, 'users', 1, 20));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('DB error');
    expect(result.current.columns).toEqual([]);
    expect(result.current.rows).toEqual([]);
  });

  it('passes correct limit/offset for page 2', async () => {
    const adapter = makeAdapter();
    renderHook(() => useTableData(adapter, 'users', 2, 20));

    await waitFor(() =>
      expect(adapter.selectRows).toHaveBeenCalledWith({ table: 'users', limit: 20, offset: 20 }),
    );
  });

  it('resets to EMPTY when table becomes null', async () => {
    const adapter = makeAdapter();
    const { result, rerender } = renderHook(
      ({ table }: { table: string | null }) => useTableData(adapter, table, 1, 20),
      { initialProps: { table: 'users' } },
    );

    await waitFor(() => expect(result.current.columns).toEqual(['id', 'name']));

    rerender({ table: null });
    expect(result.current.columns).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('ignores stale responses when deps change rapidly', async () => {
    // Two calls: first one is slow, second is fast
    let resolveFirst!: (v: unknown) => void;
    const firstCall = new Promise((r) => { resolveFirst = r; });
    const selectRows = jest.fn()
      .mockReturnValueOnce(firstCall)
      .mockResolvedValue({ columns: ['x'], rows: [['42']] });

    const adapter = makeAdapter({ selectRows, countRows: jest.fn().mockResolvedValue(1) });

    const { result, rerender } = renderHook(
      ({ table }: { table: string }) => useTableData(adapter, table, 1, 20),
      { initialProps: { table: 'first' } },
    );

    // Switch to second table — triggers second (fast) fetch
    rerender({ table: 'second' });

    // Fast fetch completes
    await waitFor(() => expect(result.current.columns).toEqual(['x']));

    // Now resolve the first (stale) call — result should NOT revert
    await act(async () => {
      resolveFirst({ columns: ['stale'], rows: [] });
      await firstCall;
    });

    expect(result.current.columns).toEqual(['x']);
  });
});
