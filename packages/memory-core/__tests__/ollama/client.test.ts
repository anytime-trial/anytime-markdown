import { createOllamaClient } from '../../src/ollama/client';

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;
afterEach(() => {
  mockFetch.mockReset();
});

// Helper to create a fake Response object
function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('createOllamaClient', () => {
  describe('endpoint validation', () => {
    it('rejects external endpoints and throws with code "rejected_external_endpoint"', () => {
      expect(() => createOllamaClient({ baseUrl: 'http://remote.example.com:11434' })).toThrow();
      try {
        createOllamaClient({ baseUrl: 'http://remote.example.com:11434' });
      } catch (err: any) {
        expect(err.code).toBe('rejected_external_endpoint');
      }
    });

    it('accepts localhost', () => {
      expect(() => createOllamaClient({ baseUrl: 'http://localhost:11434' })).not.toThrow();
    });

    it('accepts 127.0.0.1', () => {
      expect(() => createOllamaClient({ baseUrl: 'http://127.0.0.1:11434' })).not.toThrow();
    });

    it('accepts ::1 (IPv6 loopback)', () => {
      expect(() => createOllamaClient({ baseUrl: 'http://[::1]:11434' })).not.toThrow();
    });
  });

  describe('generate()', () => {
    it('returns response string on success', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockResolvedValueOnce(makeResponse({ response: 'hello world' }));

      const result = await client.generate({ model: 'llama3', prompt: 'Say hello' });

      expect(result).toEqual({ response: 'hello world' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:11434/api/generate');
      expect(JSON.parse(init.body)).toEqual({ model: 'llama3', prompt: 'Say hello', format: undefined });
    });

    it('passes format parameter when provided', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockResolvedValueOnce(makeResponse({ response: '{"key":"val"}' }));

      await client.generate({ model: 'llama3', prompt: 'Return JSON', format: 'json' });

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ model: 'llama3', prompt: 'Return JSON', format: 'json' });
    });

    it('throws with code "ollama_unreachable" when fetch throws TypeError (ECONNREFUSED)', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(client.generate({ model: 'llama3', prompt: 'test' })).rejects.toMatchObject({
        code: 'ollama_unreachable',
      });
    });

    it('throws with code "model_not_pulled" when response status is 404', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockResolvedValueOnce(makeResponse({ error: 'model not found' }, 404));

      await expect(client.generate({ model: 'missing-model', prompt: 'test' })).rejects.toMatchObject({
        code: 'model_not_pulled',
      });
    });
  });

  describe('embeddings()', () => {
    it('returns Float32Array of 1024 elements on success', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      const numbers = new Array(1024).fill(0).map((_, i) => i * 0.001);
      mockFetch.mockResolvedValueOnce(makeResponse({ embedding: numbers }));

      const result = await client.embeddings({ model: 'nomic-embed-text', prompt: 'test' });

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(1024);
      expect(result.embedding[0]).toBeCloseTo(numbers[0]);
      expect(result.embedding[1023]).toBeCloseTo(numbers[1023]);
    });

    it('posts to /api/embeddings with correct body', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      const numbers = new Array(1024).fill(0.5);
      mockFetch.mockResolvedValueOnce(makeResponse({ embedding: numbers }));

      await client.embeddings({ model: 'nomic-embed-text', prompt: 'hello' });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:11434/api/embeddings');
      expect(JSON.parse(init.body)).toEqual({ model: 'nomic-embed-text', prompt: 'hello' });
    });

    it('throws with code "ollama_unreachable" when fetch throws TypeError', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(client.embeddings({ model: 'nomic-embed-text', prompt: 'test' })).rejects.toMatchObject({
        code: 'ollama_unreachable',
      });
    });

    it('throws with code "model_not_pulled" on 404', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      mockFetch.mockResolvedValueOnce(makeResponse({ error: 'model not found' }, 404));

      await expect(client.embeddings({ model: 'missing-model', prompt: 'test' })).rejects.toMatchObject({
        code: 'model_not_pulled',
      });
    });

    it('throws with code "embedding_dim_mismatch" when embedding length is not 1024', async () => {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434' });
      const numbers = new Array(512).fill(0.5);
      mockFetch.mockResolvedValueOnce(makeResponse({ embedding: numbers }));

      await expect(client.embeddings({ model: 'wrong-model', prompt: 'test' })).rejects.toMatchObject({
        code: 'embedding_dim_mismatch',
      });
    });
  });

  describe('default baseUrl', () => {
    it('uses OLLAMA_BASE_URL env var when set', () => {
      const original = process.env.OLLAMA_BASE_URL;
      process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
      try {
        expect(() => createOllamaClient()).not.toThrow();
      } finally {
        if (original === undefined) {
          delete process.env.OLLAMA_BASE_URL;
        } else {
          process.env.OLLAMA_BASE_URL = original;
        }
      }
    });

    it('defaults to http://localhost:11434 when env var is not set', () => {
      const original = process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_BASE_URL;
      try {
        expect(() => createOllamaClient()).not.toThrow();
      } finally {
        if (original !== undefined) {
          process.env.OLLAMA_BASE_URL = original;
        }
      }
    });
  });
});
