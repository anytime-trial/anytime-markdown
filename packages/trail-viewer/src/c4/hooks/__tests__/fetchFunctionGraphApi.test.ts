// packages/trail-viewer/src/c4/hooks/__tests__/fetchFunctionGraphApi.test.ts
import {
  buildFunctionGraphUrl,
  fetchFunctionGraph,
} from '../fetchFunctionGraphApi';

describe('buildFunctionGraphUrl', () => {
  it('elementId を URL エンコードする', () => {
    const url = buildFunctionGraphUrl('http://x:1', 'src/foo.ts');
    expect(url).toBe('http://x:1/api/c4/function-graph?elementId=src%2Ffoo.ts');
  });
});

describe('fetchFunctionGraph', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('200 OK の JSON を返す', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ elementId: 'src/foo.ts', nodes: [], edges: [] }),
    })) as unknown as typeof fetch;
    const r = await fetchFunctionGraph('http://x:1', 'src/foo.ts');
    expect(r).toEqual({ elementId: 'src/foo.ts', nodes: [], edges: [] });
  });

  it('elementId が空文字なら null を返す (リクエスト送らない)', async () => {
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const r = await fetchFunctionGraph('http://x:1', '');
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('404 / 400 なら null を返す', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false, status: 404, statusText: 'Not Found',
    })) as unknown as typeof fetch;
    const r = await fetchFunctionGraph('http://x:1', 'src/foo.ts');
    expect(r).toBeNull();
  });

  it('500 なら throw する', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false, status: 500, statusText: 'Internal Error',
    })) as unknown as typeof fetch;
    await expect(fetchFunctionGraph('http://x:1', 'src/foo.ts')).rejects.toThrow();
  });
});
