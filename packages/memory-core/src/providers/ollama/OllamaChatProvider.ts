import type {
  ChatProvider,
  ChatProviderChatOptions,
  ChatStreamChunk,
  HealthCheckResult,
} from '../types';

export interface OllamaChatProviderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch;
}

interface OllamaChatLine {
  message?: { content?: string };
  done?: boolean;
}

interface OllamaTagsResponse {
  models: ReadonlyArray<{ name: string }>;
}

export class OllamaChatProvider implements ChatProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaChatProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async *chat(opts: ChatProviderChatOptions): AsyncGenerator<ChatStreamChunk> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: opts.messages,
        stream: true,
        options:
          opts.temperature !== undefined ? { temperature: opts.temperature } : undefined,
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat failed: HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const parsed = JSON.parse(line) as OllamaChatLine;
        const delta = parsed.message?.content ?? '';
        const finished = !!parsed.done;
        yield { delta, done: finished };
        if (finished) return;
      }
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data = (await res.json()) as OllamaTagsResponse;
      const hasModel = data.models.some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`),
      );
      return hasModel
        ? { ok: true }
        : {
            ok: false,
            detail: `Model ${this.model} not pulled. Run: ollama pull ${this.model}`,
          };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
