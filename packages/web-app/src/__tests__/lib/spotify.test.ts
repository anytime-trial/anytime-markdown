/**
 * spotify.ts — getClientCredentialsToken のユニットテスト
 *
 * グローバル fetch をモックして Spotify token エンドポイントを疑似。
 * モジュールキャッシュを jest.resetModules でクリアしてトークンキャッシュをリセット。
 */

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.SPOTIFY_CLIENT_ID = 'client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'client-secret';
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeFetchMock(status: number, body: object) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

describe('getClientCredentialsToken', () => {
  it('fetches a token from Spotify and returns it', async () => {
    const mockFetch = makeFetchMock(200, { access_token: 'tok123', expires_in: 3600 });
    global.fetch = mockFetch;

    const { getClientCredentialsToken } = await import('../../lib/spotify');
    const token = await getClientCredentialsToken();
    expect(token).toBe('tok123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when Spotify returns non-ok status', async () => {
    const mockFetch = makeFetchMock(401, {});
    global.fetch = mockFetch;

    const { getClientCredentialsToken } = await import('../../lib/spotify');
    await expect(getClientCredentialsToken()).rejects.toThrow('Spotify token error: 401');
  });

  it('reuses cached token when not expired', async () => {
    const mockFetch = makeFetchMock(200, { access_token: 'cached-tok', expires_in: 3600 });
    global.fetch = mockFetch;

    const { getClientCredentialsToken } = await import('../../lib/spotify');
    await getClientCredentialsToken();
    await getClientCredentialsToken();
    // second call should reuse cache → fetch called only once
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends correct Authorization header with base64-encoded credentials', async () => {
    const mockFetch = makeFetchMock(200, { access_token: 'tok', expires_in: 3600 });
    global.fetch = mockFetch;

    const { getClientCredentialsToken } = await import('../../lib/spotify');
    await getClientCredentialsToken();

    const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
    const auth = (callArgs.headers as Record<string, string>)['Authorization'];
    const expected = `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`;
    expect(auth).toBe(expected);
  });
});
