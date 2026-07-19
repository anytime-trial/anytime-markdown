/**
 * trailReaderRoute の TTL キャッシュ統合テスト。
 * cacheKey 指定時: 成功応答は再利用され fetcher は 1 回しか呼ばれない。
 * エラー時の fallback はキャッシュしない（障害の固着防止）。
 */
const mockResolveSupabaseEnv = jest.fn();

jest.mock('../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@anytime-markdown/trail-viewer/supabase', () => ({
  SupabaseTrailReader: class {},
  SupabaseC4ModelStore: class {},
}));

const MockNextResponse = class {
  _body: unknown;
  _headers: Record<string, string> = {};
  static json = jest.fn((body: unknown, init?: { headers?: Record<string, string> }) => {
    const r = new MockNextResponse(body);
    r._headers = init?.headers ?? {};
    return r;
  });
  constructor(body: unknown) {
    this._body = body;
  }
};

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { clearTrailRouteCache, trailReaderRoute } from '../lib/api-helpers';

beforeEach(() => {
  jest.clearAllMocks();
  clearTrailRouteCache();
  mockResolveSupabaseEnv.mockReturnValue({ url: 'http://localhost', anonKey: 'anon' });
});

describe('trailReaderRoute cache', () => {
  it('同一 cacheKey の 2 回目は fetcher を呼ばず同一データを返す', async () => {
    const fetcher = jest.fn().mockResolvedValue({ value: 42 });
    const r1 = await trailReaderRoute(fetcher, null, '/api/trail/x', '/api/trail/x?a=1');
    const r2 = await trailReaderRoute(fetcher, null, '/api/trail/x', '/api/trail/x?a=1');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((r1 as unknown as { _body: unknown })._body).toEqual({ value: 42 });
    expect((r2 as unknown as { _body: unknown })._body).toEqual({ value: 42 });
  });

  it('cacheKey が異なれば fetcher を再度呼ぶ', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await trailReaderRoute(fetcher, [], '/api/trail/x', '/api/trail/x?a=1');
    await trailReaderRoute(fetcher, [], '/api/trail/x', '/api/trail/x?a=2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cacheKey 省略時はキャッシュしない（毎回 fetcher を呼ぶ）', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await trailReaderRoute(fetcher, [], '/api/trail/x');
    await trailReaderRoute(fetcher, [], '/api/trail/x');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fetcher が throw した fallback 応答はキャッシュせず次回再試行する', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });
    const r1 = await trailReaderRoute(fetcher, null, '/api/trail/x', '/api/trail/x');
    const r2 = await trailReaderRoute(fetcher, null, '/api/trail/x', '/api/trail/x');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((r1 as unknown as { _body: unknown })._body).toBeNull();
    expect((r2 as unknown as { _body: unknown })._body).toEqual({ ok: true });
  });

  it('env 未設定時はキャッシュに触れず fallback を返す', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const fetcher = jest.fn();
    const r = await trailReaderRoute(fetcher, 'FB', '/api/trail/x', '/api/trail/x');
    expect(fetcher).not.toHaveBeenCalled();
    expect((r as unknown as { _body: unknown })._body).toBe('FB');
  });
});
