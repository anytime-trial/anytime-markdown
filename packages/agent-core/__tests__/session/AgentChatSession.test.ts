import { AgentChatSession } from '../../src/session/AgentChatSession';
import { ProviderRegistry } from '../../src/registry/ProviderRegistry';
import type {
  ChatProvider,
  ChatProviderChatOptions,
  ChatStreamChunk,
  HealthCheckResult,
} from '@anytime-markdown/llm-core';

class CapturingChatProvider implements ChatProvider {
  readonly name = 'cap';
  readonly model = 'm';
  lastOptions: ChatProviderChatOptions | undefined;
  constructor(private readonly script: ChatStreamChunk[]) {}
  async *chat(opts: ChatProviderChatOptions): AsyncGenerator<ChatStreamChunk> {
    this.lastOptions = opts;
    for (const chunk of this.script) {
      yield chunk;
    }
  }
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true };
  }
}

describe('AgentChatSession', () => {
  describe('constructor', () => {
    it('seeds history with the systemPrompt when provided', () => {
      const session = new AgentChatSession({
        registry: new ProviderRegistry(),
        sessionId: 's1',
        systemPrompt: 'be helpful',
      });
      const h = session.getHistory();
      expect(h).toHaveLength(1);
      expect(h[0]).toEqual({ role: 'system', content: 'be helpful' });
    });

    it('starts with empty history when no systemPrompt', () => {
      const session = new AgentChatSession({
        registry: new ProviderRegistry(),
        sessionId: 's1',
      });
      expect(session.getHistory()).toHaveLength(0);
    });
  });

  describe('appendUser / appendAssistant', () => {
    it('appends messages in order', () => {
      const session = new AgentChatSession({
        registry: new ProviderRegistry(),
        sessionId: 's1',
      });
      session.appendUser('hello');
      session.appendAssistant('hi');
      const h = session.getHistory();
      expect(h.map((m) => `${m.role}:${m.content}`)).toEqual([
        'user:hello',
        'assistant:hi',
      ]);
    });

    it('getHistory returns a copy (caller mutations do not leak)', () => {
      const session = new AgentChatSession({
        registry: new ProviderRegistry(),
        sessionId: 's1',
      });
      session.appendUser('hello');
      const snap = session.getHistory();
      (snap as { length: number }).length = 0;
      expect(session.getHistory()).toHaveLength(1);
    });
  });

  describe('stream', () => {
    it('throws when no active chat provider is registered', async () => {
      const session = new AgentChatSession({
        registry: new ProviderRegistry(),
        sessionId: 's1',
      });
      session.appendUser('hi');
      await expect(async () => {
        for await (const _ of session.stream()) {
          // drain
        }
      }).rejects.toThrow(/no active chat provider/);
    });

    it('forwards the current history to the provider', async () => {
      const registry = new ProviderRegistry();
      const provider = new CapturingChatProvider([
        { delta: 'ok', done: true },
      ]);
      registry.register({ id: 'p', kind: 'chat', provider });

      const session = new AgentChatSession({
        registry,
        sessionId: 's1',
        systemPrompt: 'sys',
      });
      session.appendUser('hi');

      for await (const _ of session.stream()) {
        // drain
      }
      expect(provider.lastOptions?.messages.map((m) => m.role)).toEqual([
        'system',
        'user',
      ]);
    });

    it('appends the accumulated assistant content to history on done', async () => {
      const registry = new ProviderRegistry();
      registry.register({
        id: 'p',
        kind: 'chat',
        provider: new CapturingChatProvider([
          { delta: 'foo', done: false },
          { delta: 'bar', done: true },
        ]),
      });

      const session = new AgentChatSession({ registry, sessionId: 's1' });
      session.appendUser('hi');
      for await (const _ of session.stream()) {
        // drain
      }

      const last = session.getHistory().at(-1);
      expect(last).toEqual({ role: 'assistant', content: 'foobar' });
    });

    it('propagates the abort signal to the provider', async () => {
      const registry = new ProviderRegistry();
      const provider = new CapturingChatProvider([{ delta: '', done: true }]);
      registry.register({ id: 'p', kind: 'chat', provider });

      const session = new AgentChatSession({ registry, sessionId: 's1' });
      const ctl = new AbortController();
      for await (const _ of session.stream({ signal: ctl.signal })) {
        // drain
      }
      expect(provider.lastOptions?.signal).toBe(ctl.signal);
    });
  });
});
