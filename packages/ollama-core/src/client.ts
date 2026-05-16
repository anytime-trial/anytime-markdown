// URL.hostname returns '[::1]' (with brackets) for IPv6 literals in Node.js
// host.docker.internal is the Docker special hostname that routes to the host machine (WSL2/macOS)
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

// generate は LLM 推論で長時間かかるため 5 分。embeddings は短時間。
const GENERATE_TIMEOUT_MS = 300_000;
const EMBEDDINGS_TIMEOUT_MS = 30_000;

function isInsideContainer(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/** Qwen3 等の thinking モデルが出力する <think>...</think> ブロックを除去して本文だけ返す。 */
function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

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
  /** Ollama model options (e.g. `{ think: false }` to disable thinking mode in Qwen3). */
  options?: Record<string, unknown>;
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
  // Dev Container 内では localhost がコンテナ自身を指すため、明示指定がなければ
  // host.docker.internal にフォールバック (WSL ホスト上の ollama に到達するため)。
  const defaultUrl =
    isInsideContainer() && !process.env.OLLAMA_BASE_URL
      ? 'http://host.docker.internal:11434'
      : 'http://localhost:11434';
  const resolvedUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? defaultUrl;

  const parsed = new URL(resolvedUrl);
  // URL.hostname strips brackets from IPv6 addresses (e.g. '[::1]' → '::1')
  const host = parsed.hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw makeError('rejected_external_endpoint');
  }

  const base = resolvedUrl.replace(/\/$/, '');

  async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        throw makeError('ollama_timeout');
      }
      if (err instanceof TypeError) {
        throw makeError('ollama_unreachable');
      }
      throw err;
    } finally {
      clearTimeout(timer);
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
    async generate({ model, prompt, format, options }: GenerateOptions): Promise<GenerateResult> {
      const body: Record<string, unknown> = { model, prompt, format, stream: false };
      if (options && Object.keys(options).length > 0) body['options'] = options;
      const data = await post<{ response: string; thinking?: string }>('/api/generate', body, GENERATE_TIMEOUT_MS);
      // Qwen3 系の thinking モデルはコンテンツを `thinking` フィールドに入れ、`response` を空にして返すことがある。
      // その場合は thinking 側を本文として採用する。
      const raw = data.response || data.thinking || '';
      return { response: stripThinkingBlocks(raw) };
    },

    async embeddings({ model, prompt }: EmbeddingsOptions): Promise<EmbeddingsResult> {
      const data = await post<{ embedding: number[] }>('/api/embeddings', { model, prompt }, EMBEDDINGS_TIMEOUT_MS);
      const numbers = data.embedding;
      if (numbers.length !== 1024) {
        throw makeError('embedding_dim_mismatch');
      }
      return { embedding: Float32Array.from(numbers) };
    },
  };
}
