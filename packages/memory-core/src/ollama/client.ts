// URL.hostname returns '[::1]' (with brackets) for IPv6 literals in Node.js
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function makeError(code: string): Error {
  const err = new Error(code);
  (err as any).code = code;
  return err;
}

export interface OllamaClientOptions {
  baseUrl?: string;
}

export interface GenerateOptions {
  model: string;
  prompt: string;
  format?: string;
}

export interface GenerateResult {
  response: string;
}

export interface EmbeddingsOptions {
  model: string;
  prompt: string;
}

export interface EmbeddingsResult {
  embedding: Float32Array;
}

export interface OllamaClient {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  embeddings(options: EmbeddingsOptions): Promise<EmbeddingsResult>;
}

export function createOllamaClient(options: OllamaClientOptions = {}): OllamaClient {
  const resolvedUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  const parsed = new URL(resolvedUrl);
  // URL.hostname strips brackets from IPv6 addresses (e.g. '[::1]' → '::1')
  const host = parsed.hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw makeError('rejected_external_endpoint');
  }

  const base = resolvedUrl.replace(/\/$/, '');

  async function post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof TypeError) {
        throw makeError('ollama_unreachable');
      }
      throw err;
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw makeError('model_not_pulled');
      }
      throw new Error(`ollama_http_error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async generate({ model, prompt, format }: GenerateOptions): Promise<GenerateResult> {
      const data = await post<{ response: string }>('/api/generate', { model, prompt, format });
      return { response: data.response };
    },

    async embeddings({ model, prompt }: EmbeddingsOptions): Promise<EmbeddingsResult> {
      const data = await post<{ embedding: number[] }>('/api/embeddings', { model, prompt });
      const numbers = data.embedding;
      if (numbers.length !== 1024) {
        throw makeError('embedding_dim_mismatch');
      }
      return { embedding: Float32Array.from(numbers) };
    },
  };
}
