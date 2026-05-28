/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useFunctionGraph } from '../useFunctionGraph';

describe('useFunctionGraph', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('elementId 未指定なら fetch しない', () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    renderHook(() => useFunctionGraph('http://x:1', ''));
    expect(spy).not.toHaveBeenCalled();
  });

  it('mount 時に 1 回 fetch する', async () => {
    const spy = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ elementId: 'src/foo.ts', nodes: [], edges: [] }),
    }));
    globalThis.fetch = spy as unknown as typeof fetch;
    const { result } = renderHook(() => useFunctionGraph('http://x:1', 'src/foo.ts'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.data?.elementId).toBe('src/foo.ts');
    expect(result.current.error).toBeNull();
  });

  it('elementId 変化で refetch する', async () => {
    const spy = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ elementId: url, nodes: [], edges: [] }),
    }));
    globalThis.fetch = spy as unknown as typeof fetch;
    const { result, rerender } = renderHook(
      ({ id }) => useFunctionGraph('http://x:1', id),
      { initialProps: { id: 'src/a.ts' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);
    rerender({ id: 'src/b.ts' });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('fetch エラー時に error state を設定する', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false, status: 500, statusText: 'fail',
    })) as unknown as typeof fetch;
    const { result } = renderHook(() => useFunctionGraph('http://x:1', 'src/foo.ts'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });
});
