import { OllamaEmbeddingProvider } from '../src/OllamaEmbeddingProvider';

describe('OllamaEmbeddingProvider.embed', () => {
  test('複数 prompt を逐次呼び出して Float32Array[] を返す', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [0.4, 0.5, 0.6] }), { status: 200 }),
      ) as unknown as typeof fetch;

    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'bge-m3',
      dimensions: 3,
      fetchImpl: mockFetch,
    });
    const result = await provider.embed(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(Array.from(result[0])).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
  });

  test('HTTP エラー時に throw', async () => {
    const mockFetch = jest.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'bge-m3',
      dimensions: 1024,
      fetchImpl: mockFetch,
    });
    await expect(provider.embed(['x'])).rejects.toThrow(/HTTP 500/);
  });

  test('response から embedding フィールドが欠落していたら throw', async () => {
    const mockFetch = jest.fn(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch;
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'bge-m3',
      dimensions: 1024,
      fetchImpl: mockFetch,
    });
    await expect(provider.embed(['x'])).rejects.toThrow(/missing "embedding"/);
  });
});

describe('OllamaEmbeddingProvider.healthCheck', () => {
  test('モデル pulled 済みなら ok=true', async () => {
    const mockFetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'bge-m3' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'bge-m3',
      dimensions: 1024,
      fetchImpl: mockFetch,
    });
    const r = await provider.healthCheck();
    expect(r.ok).toBe(true);
  });

  test('モデル未 pull で ok=false', async () => {
    const mockFetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'other' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const provider = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'bge-m3',
      dimensions: 1024,
      fetchImpl: mockFetch,
    });
    const r = await provider.healthCheck();
    expect(r.ok).toBe(false);
  });
});
