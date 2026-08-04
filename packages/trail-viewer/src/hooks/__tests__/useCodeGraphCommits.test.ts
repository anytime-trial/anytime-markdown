/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from '@testing-library/react';

import { useCodeGraphCommits } from '../useCodeGraphCommits';

const COMMITS = [
  {
    sha: '1111111111111111111111111111111111111111',
    shortSha: '11111111',
    committedAt: '2026-07-17T09:00:00.000Z',
    subject: 'feat: A',
    hasGraph: true,
  },
  {
    sha: '2222222222222222222222222222222222222222',
    shortSha: '22222222',
    committedAt: '2026-07-17T10:00:00.000Z',
    subject: 'fix: B',
    hasGraph: false,
  },
];

function mockFetchOnce(body: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn(() =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as unknown as Response),
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('useCodeGraphCommits', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('repo と to を指定して区間のコミット一覧を取得する', async () => {
    const fetchMock = mockFetchOnce({ commits: COMMITS });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'anytime-markdown', to: 'v1.15.0', from: 'v1.14.0' }),
    );
    await waitFor(() => expect(result.current.commits).toHaveLength(2));
    expect(result.current.commits.map((c) => c.shortSha)).toEqual(['11111111', '22222222']);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://x/api/code-graph/commits?repo=anytime-markdown&to=v1.15.0&from=v1.14.0',
    );
  });

  it('from 省略時は from を送らない（最古からの区間）', async () => {
    const fetchMock = mockFetchOnce({ commits: COMMITS });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'repo', to: 'v1.0.0' }),
    );
    await waitFor(() => expect(result.current.commits).toHaveLength(2));
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://x/api/code-graph/commits?repo=repo&to=v1.0.0');
  });

  it('enabled=false では fetch しない（リリース粒度のままコミットを取りに行かない）', async () => {
    const fetchMock = mockFetchOnce({ commits: COMMITS });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: false, repo: 'repo', to: 'v1.0.0' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.commits).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('to 未指定では fetch しない（区間の上端が決まらない）', async () => {
    const fetchMock = mockFetchOnce({ commits: COMMITS });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'repo' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP エラーでも例外を投げず空配列へ縮退する', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchOnce({}, false, 500);
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'repo', to: 'v1.0.0' }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.commits).toEqual([]);
  });

  it('形の合わない要素を捨てる（部分的に壊れた応答で全滅させない）', async () => {
    mockFetchOnce({ commits: [COMMITS[0], { sha: 'broken' }, null] });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'repo', to: 'v1.0.0' }),
    );
    await waitFor(() => expect(result.current.commits).toHaveLength(1));
    expect(result.current.commits[0].shortSha).toBe('11111111');
  });

  it('refetch で再取得する（生成完了後に在庫フラグを更新するため）', async () => {
    const fetchMock = mockFetchOnce({ commits: COMMITS });
    const { result } = renderHook(() =>
      useCodeGraphCommits('http://x', { enabled: true, repo: 'repo', to: 'v1.0.0' }),
    );
    await waitFor(() => expect(result.current.commits).toHaveLength(2));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
