/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from '@testing-library/react';

import { useCodeGraphReleases } from '../useCodeGraphReleases';

const TICKS = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: false },
];

function mockFetchOnce(body: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn(() =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as unknown as Response),
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('useCodeGraphReleases', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('repo 指定で一覧を取得し、サーバの並びをそのまま保つ', async () => {
    const fetchMock = mockFetchOnce({ releases: TICKS });
    const { result } = renderHook(() => useCodeGraphReleases('http://x', 'anytime-markdown'));
    await waitFor(() => expect(result.current.releases).toHaveLength(2));
    expect(result.current.releases.map((r) => r.tag)).toEqual(['v1.14.0', 'v1.15.0']);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://x/api/code-graph/releases?repo=anytime-markdown',
    );
  });

  it('repo 未指定では fetch せず空配列を返す', async () => {
    const fetchMock = mockFetchOnce({ releases: TICKS });
    const { result } = renderHook(() => useCodeGraphReleases('http://x', undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.releases).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP エラーでも例外を投げず空配列へ縮退する', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchOnce({}, false, 500);
    const { result } = renderHook(() => useCodeGraphReleases('http://x', 'repo'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.releases).toEqual([]);
  });

  it('形の合わない要素を捨てる（部分的に壊れた応答で全滅させない）', async () => {
    mockFetchOnce({ releases: [TICKS[0], { tag: 'broken' }, null] });
    const { result } = renderHook(() => useCodeGraphReleases('http://x', 'repo'));
    await waitFor(() => expect(result.current.releases).toHaveLength(1));
    expect(result.current.releases[0].tag).toBe('v1.14.0');
  });

  it('refetch で再取得する（オンデマンド生成の完了後に在庫を更新するため）', async () => {
    const fetchMock = mockFetchOnce({ releases: TICKS });
    const { result } = renderHook(() => useCodeGraphReleases('http://x', 'repo'));
    await waitFor(() => expect(result.current.releases).toHaveLength(2));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
