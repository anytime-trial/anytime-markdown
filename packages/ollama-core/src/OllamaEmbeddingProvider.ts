import type { EmbeddingProvider, HealthCheckResult } from '@anytime-markdown/llm-core';
import { checkOllamaModelAvailable } from './healthCheck';

export interface OllamaEmbeddingProviderOptions {
  readonly baseUrl: string;
  readonly model: string;
  /** モデル次元 (BGE-M3 = 1024)。HealthCheck 時の参考表示にも使う。 */
  readonly dimensions: number;
  readonly fetchImpl?: typeof fetch;
}

interface OllamaEmbeddingsResponse {
  embedding?: ReadonlyArray<number>;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaEmbeddingProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.model = opts.model;
    this.dimensions = opts.dimensions;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async embed(texts: ReadonlyArray<string>, signal?: AbortSignal): Promise<Float32Array[]> {
    // Ollama /api/embeddings は 1 prompt のみ。配列入力は逐次呼び出しで実装する。
    const out: Float32Array[] = [];
    for (const prompt of texts) {
      const res = await this.fetchImpl(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt }),
        signal,
      });
      if (!res.ok) throw new Error(`Ollama embeddings failed: HTTP ${res.status}`);
      const data = (await res.json()) as OllamaEmbeddingsResponse;
      if (!data.embedding) {
        throw new Error('Ollama embeddings response missing "embedding" field');
      }
      out.push(Float32Array.from(data.embedding));
    }
    return out;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return checkOllamaModelAvailable(this.baseUrl, this.model, this.fetchImpl);
  }
}
