import type { OllamaClient } from '@anytime-markdown/ollama-core';

export interface MockOllamaClientOptions {
  /** デフォルトで返す埋め込みベクトル (size を揃える)。 */
  readonly fixedEmbedding?: Float32Array;
  /** id ごとに異なる埋め込みを返したい場合の、prompt → embedding マップ。 */
  readonly embeddingsByPrompt?: ReadonlyMap<string, Float32Array>;
  /** generate() のレスポンス本文。 */
  readonly generateResponse?: string;
}

export function createMockOllamaClient(opts: MockOllamaClientOptions = {}): OllamaClient {
  return {
    async embeddings({ prompt }) {
      const fixed = opts.embeddingsByPrompt?.get(prompt);
      const vec = fixed ?? opts.fixedEmbedding ?? new Float32Array(1024);
      return { embedding: vec };
    },
    async generate() {
      return { response: opts.generateResponse ?? '' };
    },
  };
}
