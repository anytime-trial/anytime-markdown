import { checkOllamaModelAvailable } from '../src/healthCheck';

function makeFetch(impl: () => Promise<unknown>): typeof fetch {
  return impl as unknown as typeof fetch;
}

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('checkOllamaModelAvailable', () => {
  it('returns ok when the exact model name is present', async () => {
    const fetchImpl = makeFetch(() =>
      Promise.resolve(makeResponse({ models: [{ name: 'qwen3:14b' }] })),
    );
    const result = await checkOllamaModelAvailable('http://localhost:11434', 'qwen3:14b', fetchImpl);
    expect(result).toEqual({ ok: true });
  });

  it('matches model by base name + ":" prefix', async () => {
    const fetchImpl = makeFetch(() =>
      Promise.resolve(makeResponse({ models: [{ name: 'qwen3:14b' }] })),
    );
    const result = await checkOllamaModelAvailable('http://localhost:11434', 'qwen3', fetchImpl);
    expect(result).toEqual({ ok: true });
  });

  it('returns detail with HTTP status when /api/tags responds with non-ok', async () => {
    const fetchImpl = makeFetch(() =>
      Promise.resolve(makeResponse(null, false, 503)),
    );
    const result = await checkOllamaModelAvailable(
      'http://localhost:11434',
      'qwen3',
      fetchImpl,
    );
    expect(result).toEqual({ ok: false, detail: 'HTTP 503' });
  });

  it('returns "not pulled" detail when model is missing from /api/tags', async () => {
    const fetchImpl = makeFetch(() =>
      Promise.resolve(makeResponse({ models: [{ name: 'other-model' }] })),
    );
    const result = await checkOllamaModelAvailable(
      'http://localhost:11434',
      'qwen3',
      fetchImpl,
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { detail: string }).detail).toContain('Model qwen3 not pulled');
  });

  it('captures Error.message when fetch rejects with an Error', async () => {
    const fetchImpl = makeFetch(() => Promise.reject(new Error('econnrefused')));
    const result = await checkOllamaModelAvailable(
      'http://localhost:11434',
      'qwen3',
      fetchImpl,
    );
    expect(result).toEqual({ ok: false, detail: 'econnrefused' });
  });

  it('stringifies non-Error rejections', async () => {
    const fetchImpl = makeFetch(() => Promise.reject('plain-string-error'));
    const result = await checkOllamaModelAvailable(
      'http://localhost:11434',
      'qwen3',
      fetchImpl,
    );
    expect(result).toEqual({ ok: false, detail: 'plain-string-error' });
  });
});
