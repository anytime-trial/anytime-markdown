import { fetchApiJson } from '../lib/fetchApiJson';

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('fetchApiJson', () => {
  it('2xx なら JSON を返す', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ categories: [] }),
    });

    await expect(fetchApiJson('/api/press-docs')).resolves.toEqual({ categories: [] });
  });

  it('503 の縮退ペイロードを成功として返さない', async () => {
    const json = jest.fn(async () => ({ categories: [] }));
    mockFetch.mockResolvedValue({ ok: false, status: 503, json });

    await expect(fetchApiJson('/api/press-docs')).rejects.toThrow('/api/press-docs: HTTP 503');
    // 本文の JSON パースまで到達しない（HTML が返っていても構文エラーにしない）
    expect(json).not.toHaveBeenCalled();
  });

  it('404 で HTML が返っても JSON パースを試みない', async () => {
    const json = jest.fn(async () => {
      throw new SyntaxError("Unexpected token '<'");
    });
    mockFetch.mockResolvedValue({ ok: false, status: 404, json });

    await expect(fetchApiJson('/api/weather')).rejects.toThrow('/api/weather: HTTP 404');
    expect(json).not.toHaveBeenCalled();
  });

  it('init をそのまま fetch へ渡す', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const init = { cache: 'no-store' as const };

    await fetchApiJson('/api/press-docs', init);

    expect(mockFetch).toHaveBeenCalledWith('/api/press-docs', init);
  });
});
