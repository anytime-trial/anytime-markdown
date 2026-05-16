import type {
  ChatMessage,
  ChatStreamChunk,
} from '@anytime-markdown/llm-core';
import type { ProviderRegistry } from '../registry/ProviderRegistry';

export interface AgentChatSessionOptions {
  readonly registry: ProviderRegistry;
  readonly sessionId: string;
  readonly systemPrompt?: string;
  readonly preferredModel?: string;
}

export class AgentChatSession {
  readonly sessionId: string;
  readonly preferredModel: string | undefined;
  private readonly registry: ProviderRegistry;
  private readonly history: ChatMessage[] = [];

  constructor(opts: AgentChatSessionOptions) {
    this.sessionId = opts.sessionId;
    this.registry = opts.registry;
    this.preferredModel = opts.preferredModel;
    if (opts.systemPrompt) {
      this.history.push({ role: 'system', content: opts.systemPrompt });
    }
  }

  appendUser(content: string): void {
    this.history.push({ role: 'user', content });
  }

  appendAssistant(content: string): void {
    this.history.push({ role: 'assistant', content });
  }

  getHistory(): readonly ChatMessage[] {
    return [...this.history];
  }

  async *stream(opts?: { signal?: AbortSignal }): AsyncGenerator<ChatStreamChunk> {
    const provider = this.registry.getActive('chat');
    if (!provider) {
      throw new Error('AgentChatSession.stream: no active chat provider');
    }

    let accumulated = '';
    const iter = provider.chat({
      messages: [...this.history],
      signal: opts?.signal,
    });

    for await (const chunk of iter) {
      if (chunk.delta) accumulated += chunk.delta;
      yield chunk;
      if (chunk.done) {
        if (accumulated) {
          this.history.push({ role: 'assistant', content: accumulated });
        }
        return;
      }
    }
  }
}
