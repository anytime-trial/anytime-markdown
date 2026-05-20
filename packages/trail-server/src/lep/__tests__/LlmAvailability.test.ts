import {
  checkLlmAvailability,
  checkOllamaModelAvailable,
  evaluateLlmRequirement,
  ollamaUnavailableHint,
  type LlmProviderAvailability,
} from '../LlmAvailability';

function fakeFetch(handler: (url: string) => unknown): typeof fetch {
  return (async (url: string) => {
    const result = handler(String(url));
    if (result instanceof Error) throw result;
    return result as Response;
  }) as unknown as typeof fetch;
}

function tagsResponse(names: string[]): Response {
  return {
    ok: true,
    json: async () => ({ models: names.map((name) => ({ name })) }),
  } as unknown as Response;
}

describe('checkOllamaModelAvailable', () => {
  it('ok when model present (exact match)', async () => {
    const fetchImpl = fakeFetch(() => tagsResponse(['bge-m3', 'qwen2.5-coder:14b']));
    expect(await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl)).toEqual({ ok: true });
  });

  it('ok when model present (tag prefix match)', async () => {
    const fetchImpl = fakeFetch(() => tagsResponse(['qwen2.5-coder:14b']));
    const r = await checkOllamaModelAvailable('http://x', 'qwen2.5-coder', fetchImpl);
    expect(r.ok).toBe(true);
  });

  it('not ok with hint when model not pulled', async () => {
    const fetchImpl = fakeFetch(() => tagsResponse(['other-model']));
    const r = await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ollama pull bge-m3');
  });

  it('not ok on HTTP error', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }) as Response);
    const r = await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl);
    expect(r).toEqual({ ok: false, detail: 'HTTP 500' });
  });

  it('not ok when fetch throws (connection refused)', async () => {
    const fetchImpl = fakeFetch(() => new Error('ECONNREFUSED'));
    const r = await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ECONNREFUSED');
  });

  it('not ok when models array is absent (empty tags response)', async () => {
    const fetchImpl = fakeFetch(() => ({
      ok: true,
      json: async () => ({}), // models フィールドなし
    }) as unknown as Response);
    const r = await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ollama pull bge-m3');
  });

  it('not ok when fetch throws non-Error (string)', async () => {
    const fetchImpl = (async () => { throw 'timeout'; }) as unknown as typeof fetch;
    const r = await checkOllamaModelAvailable('http://x', 'bge-m3', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('timeout');
  });
});

describe('checkLlmAvailability', () => {
  it('reports both capabilities', async () => {
    const fetchImpl = fakeFetch(() => tagsResponse(['qwen2.5-coder:14b']));
    const a = await checkLlmAvailability({
      baseUrl: 'http://x',
      chatModel: 'qwen2.5-coder:14b',
      embedModel: 'bge-m3',
      fetchImpl,
    });
    expect(a.ollama_chat.ok).toBe(true);
    expect(a.ollama_embedding.ok).toBe(false); // bge-m3 not in tags
  });
});

describe('checkLlmAvailability (timeout injection)', () => {
  it('passes timeoutMs to each model check', async () => {
    const fetchImpl = fakeFetch(() => tagsResponse(['mymodel']));
    const a = await checkLlmAvailability({
      baseUrl: 'http://x',
      chatModel: 'mymodel',
      embedModel: 'mymodel',
      fetchImpl,
      timeoutMs: 100,
    });
    expect(a.ollama_chat.ok).toBe(true);
    expect(a.ollama_embedding.ok).toBe(true);
  });
});

describe('evaluateLlmRequirement', () => {
  const both: LlmProviderAvailability = { ollama_chat: { ok: true }, ollama_embedding: { ok: true } };
  const embedNg: LlmProviderAvailability = {
    ollama_chat: { ok: true },
    ollama_embedding: { ok: false, detail: 'not pulled' },
  };
  const allNg: LlmProviderAvailability = {
    ollama_chat: { ok: false, detail: 'ECONNREFUSED' },
    ollama_embedding: { ok: false, detail: 'ECONNREFUSED' },
  };

  it('satisfied when both available', () => {
    const r = evaluateLlmRequirement(
      { chat: { provider: 'ollama', model: 'c' }, embedding: { provider: 'ollama', model: 'e' } },
      both,
    );
    expect(r.satisfied).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('chat+embedding analyzer not satisfied when embedding NG', () => {
    const r = evaluateLlmRequirement(
      { chat: { provider: 'ollama', model: 'c' }, embedding: { provider: 'ollama', model: 'e' } },
      embedNg,
    );
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual(['embedding']);
  });

  it('embedding-only analyzer not satisfied when embedding NG', () => {
    const r = evaluateLlmRequirement({ embedding: { provider: 'ollama', model: 'e' } }, embedNg);
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual(['embedding']);
  });

  it('LLM-free analyzer (no requiresLlm) is always satisfied', () => {
    const r = evaluateLlmRequirement(undefined, allNg);
    expect(r.satisfied).toBe(true);
    expect(r.missing).toEqual([]);
  });
});

describe('evaluateLlmRequirement (detail building)', () => {
  it('includes detail string from unavailable providers', () => {
    const r = evaluateLlmRequirement(
      { chat: { provider: 'ollama', model: 'c' }, embedding: { provider: 'ollama', model: 'e' } },
      {
        ollama_chat: { ok: false, detail: 'chat-err' },
        ollama_embedding: { ok: false, detail: 'embed-err' },
      },
    );
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual(['chat', 'embedding']);
    expect(r.detail).toContain('chat: chat-err');
    expect(r.detail).toContain('embedding: embed-err');
  });

  it('omits detail string when capability has no detail message', () => {
    const r = evaluateLlmRequirement(
      { chat: { provider: 'ollama', model: 'c' } },
      { ollama_chat: { ok: false }, ollama_embedding: { ok: true } },
    );
    expect(r.satisfied).toBe(false);
    expect(r.detail).toBe(''); // no detail → empty string
  });
});

describe('ollamaUnavailableHint', () => {
  it('mentions host.docker.internal for Dev Container', () => {
    expect(ollamaUnavailableHint('http://localhost:11434')).toContain('host.docker.internal');
  });

  it('uses default localhost URL when baseUrl is omitted', () => {
    const hint = ollamaUnavailableHint();
    expect(hint).toContain('http://localhost:11434');
    expect(hint).toContain('host.docker.internal');
  });
});
