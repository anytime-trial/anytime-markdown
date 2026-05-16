import { ProviderRegistry } from '../../src/registry/ProviderRegistry';
import type {
  ChatProvider,
  EmbeddingProvider,
  HealthCheckResult,
} from '@anytime-markdown/llm-core';
import type { ProviderRegistryChange } from '../../src/registry/types';

class StubChatProvider implements ChatProvider {
  readonly name: string;
  readonly model: string;
  constructor(name: string, model = 'm') {
    this.name = name;
    this.model = model;
  }
  async *chat(): AsyncGenerator<{ delta: string; done: boolean }> {
    yield { delta: '', done: true };
  }
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true };
  }
}

class StubEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions = 4;
  constructor(name: string, model = 'm') {
    this.name = name;
    this.model = model;
  }
  async embed(texts: ReadonlyArray<string>): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(this.dimensions));
  }
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true };
  }
}

describe('ProviderRegistry', () => {
  describe('register', () => {
    it('adds a chat provider and lists it', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      const list = r.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('a');
      expect(list[0].kind).toBe('chat');
    });

    it('rejects duplicate id within the same kind', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      expect(() =>
        r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') })
      ).toThrow(/already registered/i);
    });

    it('allows the same id across different kinds', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      r.register({
        id: 'a',
        kind: 'embedding',
        provider: new StubEmbeddingProvider('a'),
      });
      expect(r.list()).toHaveLength(2);
    });

    it('auto-activates the first provider of each kind', () => {
      const r = new ProviderRegistry();
      const chat = new StubChatProvider('a');
      r.register({ id: 'a', kind: 'chat', provider: chat });
      expect(r.getActive('chat')).toBe(chat);

      const emb = new StubEmbeddingProvider('e');
      r.register({ id: 'e', kind: 'embedding', provider: emb });
      expect(r.getActive('embedding')).toBe(emb);
    });

    it('does not change active when a second provider of the same kind is registered', () => {
      const r = new ProviderRegistry();
      const first = new StubChatProvider('first');
      const second = new StubChatProvider('second');
      r.register({ id: 'first', kind: 'chat', provider: first });
      r.register({ id: 'second', kind: 'chat', provider: second });
      expect(r.getActive('chat')).toBe(first);
    });
  });

  describe('unregister', () => {
    it('removes a provider and returns true', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      expect(r.unregister('a')).toBe(true);
      expect(r.list()).toHaveLength(0);
    });

    it('returns false for unknown id', () => {
      const r = new ProviderRegistry();
      expect(r.unregister('nope')).toBe(false);
    });

    it('clears active when the active provider is removed', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      r.unregister('a');
      expect(r.getActive('chat')).toBeUndefined();
    });

    it('promotes the next remaining provider of the same kind to active', () => {
      const r = new ProviderRegistry();
      const first = new StubChatProvider('first');
      const second = new StubChatProvider('second');
      r.register({ id: 'first', kind: 'chat', provider: first });
      r.register({ id: 'second', kind: 'chat', provider: second });
      r.unregister('first');
      expect(r.getActive('chat')).toBe(second);
    });
  });

  describe('setActive', () => {
    it('switches the active provider within a kind', () => {
      const r = new ProviderRegistry();
      const first = new StubChatProvider('first');
      const second = new StubChatProvider('second');
      r.register({ id: 'first', kind: 'chat', provider: first });
      r.register({ id: 'second', kind: 'chat', provider: second });
      r.setActive('second');
      expect(r.getActive('chat')).toBe(second);
    });

    it('throws for unknown id', () => {
      const r = new ProviderRegistry();
      expect(() => r.setActive('nope')).toThrow(/not registered/i);
    });
  });

  describe('list', () => {
    it('filters by kind', () => {
      const r = new ProviderRegistry();
      r.register({ id: 'c', kind: 'chat', provider: new StubChatProvider('c') });
      r.register({
        id: 'e',
        kind: 'embedding',
        provider: new StubEmbeddingProvider('e'),
      });
      expect(r.list('chat')).toHaveLength(1);
      expect(r.list('embedding')).toHaveLength(1);
    });
  });

  describe('onChanged', () => {
    it('fires register / unregister / activate events', () => {
      const r = new ProviderRegistry();
      const events: ProviderRegistryChange[] = [];
      const off = r.onChanged((c) => events.push(c));

      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      r.register({ id: 'b', kind: 'chat', provider: new StubChatProvider('b') });
      r.setActive('b');
      r.unregister('a');

      const types = events.map((e) => `${e.type}:${e.id}`);
      // first register auto-activates → register + activate
      expect(types).toEqual([
        'register:a',
        'activate:a',
        'register:b',
        'activate:b',
        'unregister:a',
      ]);

      off();
    });

    it('stops delivering after the listener is disposed', () => {
      const r = new ProviderRegistry();
      const events: ProviderRegistryChange[] = [];
      const off = r.onChanged((c) => events.push(c));
      off();
      r.register({ id: 'a', kind: 'chat', provider: new StubChatProvider('a') });
      expect(events).toHaveLength(0);
    });
  });
});
