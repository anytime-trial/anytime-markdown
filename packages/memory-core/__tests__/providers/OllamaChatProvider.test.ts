import { OllamaChatProvider } from '../../src/providers/ollama/OllamaChatProvider';

function makeStreamResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(new TextEncoder().encode(line + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('OllamaChatProvider.chat', () => {
  test('ストリーム delta を yield して done で終わる', async () => {
    const mockFetch = jest.fn(async () =>
      makeStreamResponse([
        JSON.stringify({ message: { content: 'Hello' }, done: false }),
        JSON.stringify({ message: { content: ' World' }, done: false }),
        JSON.stringify({ done: true }),
      ]),
    ) as unknown as typeof fetch;

    const provider = new OllamaChatProvider({
      baseUrl: 'http://localhost:11434',
      model: 'test',
      fetchImpl: mockFetch,
    });
    const chunks: { delta: string; done: boolean }[] = [];
    for await (const c of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.delta).join('')).toBe('Hello World');
    expect(chunks.at(-1)?.done).toBe(true);
  });

  test('HTTP エラー時に throw', async () => {
    const mockFetch = jest.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const provider = new OllamaChatProvider({
      baseUrl: 'http://localhost:11434',
      model: 'test',
      fetchImpl: mockFetch,
    });
    await expect(async () => {
      for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        /* consume */
      }
    }).rejects.toThrow(/HTTP 500/);
  });
});

describe('OllamaChatProvider.healthCheck', () => {
  test('モデル pulled 済みなら ok=true', async () => {
    const mockFetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'test:latest' }] }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const provider = new OllamaChatProvider({
      baseUrl: 'http://localhost:11434',
      model: 'test',
      fetchImpl: mockFetch,
    });
    const r = await provider.healthCheck();
    expect(r.ok).toBe(true);
  });

  test('モデル未 pull で ok=false かつ detail にモデル名', async () => {
    const mockFetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'other' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const provider = new OllamaChatProvider({
      baseUrl: 'http://localhost:11434',
      model: 'test',
      fetchImpl: mockFetch,
    });
    const r = await provider.healthCheck();
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('test');
  });

  test('接続失敗時に ok=false かつ detail にエラー内容', async () => {
    const mockFetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const provider = new OllamaChatProvider({
      baseUrl: 'http://localhost:11434',
      model: 'test',
      fetchImpl: mockFetch,
    });
    const r = await provider.healthCheck();
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ECONNREFUSED');
  });
});
