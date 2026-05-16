import { HealthMonitor } from '../../src/health/HealthMonitor';
import { ProviderRegistry } from '../../src/registry/ProviderRegistry';
import type {
  ChatProvider,
  EmbeddingProvider,
  HealthCheckResult,
} from '@anytime-markdown/llm-core';
import type { HealthSnapshot } from '../../src/health/types';

class StubChatProvider implements ChatProvider {
  readonly name: string;
  readonly model = 'm';
  constructor(name: string, public next: () => Promise<HealthCheckResult>) {
    this.name = name;
  }
  async *chat(): AsyncGenerator<{ delta: string; done: boolean }> {
    yield { delta: '', done: true };
  }
  healthCheck(): Promise<HealthCheckResult> {
    return this.next();
  }
}

class StubEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly model = 'm';
  readonly dimensions = 4;
  constructor(name: string, public next: () => Promise<HealthCheckResult>) {
    this.name = name;
  }
  async embed(texts: ReadonlyArray<string>): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(this.dimensions));
  }
  healthCheck(): Promise<HealthCheckResult> {
    return this.next();
  }
}

const fixedClock = () => '2026-05-16T00:00:00.000Z';

describe('HealthMonitor', () => {
  describe('checkOnce', () => {
    it('polls every registered provider and stores snapshots', async () => {
      const registry = new ProviderRegistry();
      registry.register({
        id: 'a',
        kind: 'chat',
        provider: new StubChatProvider('a', async () => ({ ok: true })),
      });
      registry.register({
        id: 'b',
        kind: 'embedding',
        provider: new StubEmbeddingProvider('b', async () => ({ ok: false, detail: 'down' })),
      });

      const mon = new HealthMonitor(registry, fixedClock);
      await mon.checkOnce();

      expect(mon.getAll()).toEqual([
        { providerId: 'a', kind: 'chat', ok: true, detail: undefined, checkedAt: fixedClock() },
        { providerId: 'b', kind: 'embedding', ok: false, detail: 'down', checkedAt: fixedClock() },
      ]);
    });

    it('captures thrown errors as ok=false with the error detail', async () => {
      const registry = new ProviderRegistry();
      registry.register({
        id: 'a',
        kind: 'chat',
        provider: new StubChatProvider('a', async () => {
          throw new Error('boom');
        }),
      });

      const mon = new HealthMonitor(registry, fixedClock);
      await mon.checkOnce();

      const snap = mon.getSnapshot('a');
      expect(snap?.ok).toBe(false);
      expect(snap?.detail).toMatch(/boom/);
    });
  });

  describe('onChanged', () => {
    it('emits only when ok or detail changes', async () => {
      const registry = new ProviderRegistry();
      let count = 0;
      registry.register({
        id: 'a',
        kind: 'chat',
        provider: new StubChatProvider('a', async () => {
          count++;
          if (count === 1) return { ok: true };
          if (count === 2) return { ok: true };
          return { ok: false, detail: 'now down' };
        }),
      });

      const mon = new HealthMonitor(registry, fixedClock);
      const events: HealthSnapshot[] = [];
      mon.onChanged((s) => events.push(s));

      await mon.checkOnce();
      await mon.checkOnce();
      await mon.checkOnce();

      // initial result (no prev) → emit; same result → no emit; change → emit
      expect(events).toHaveLength(2);
      expect(events[0].ok).toBe(true);
      expect(events[1].ok).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('rejects non-positive interval', () => {
      const registry = new ProviderRegistry();
      const mon = new HealthMonitor(registry, fixedClock);
      expect(() => mon.start(0)).toThrow(/> 0/);
    });

    it('start polls on interval and stop clears the timer', async () => {
      jest.useFakeTimers();
      try {
        const registry = new ProviderRegistry();
        let calls = 0;
        registry.register({
          id: 'a',
          kind: 'chat',
          provider: new StubChatProvider('a', async () => {
            calls++;
            return { ok: true };
          }),
        });

        const mon = new HealthMonitor(registry, fixedClock);
        mon.start(1);

        jest.advanceTimersByTime(3000);
        await Promise.resolve();
        await Promise.resolve();

        mon.stop();
        const callsAtStop = calls;

        jest.advanceTimersByTime(5000);
        await Promise.resolve();

        expect(callsAtStop).toBeGreaterThanOrEqual(1);
        expect(calls).toBe(callsAtStop);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getSnapshot', () => {
    it('returns undefined for unknown providerId', () => {
      const mon = new HealthMonitor(new ProviderRegistry(), fixedClock);
      expect(mon.getSnapshot('nope')).toBeUndefined();
    });
  });
});
