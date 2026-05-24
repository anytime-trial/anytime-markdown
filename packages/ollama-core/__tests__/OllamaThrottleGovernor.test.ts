import { OllamaThrottleGovernor } from '../src/throttle/OllamaThrottleGovernor';

export function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

const baseOpts = { enabled: true, slowdownFactor: 1.5, cooldownSec: 30, maxContinuousMin: 15 };

describe('OllamaThrottleGovernor — state', () => {
  it('starts in COOLING for cooldownSec when enabled (start slow)', () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    expect(g.state()).toBe('COOLING');
    expect(g.shouldDeferScheduled()).toBe(true);
    c.advance(30_000);
    expect(g.state()).toBe('NORMAL');
    expect(g.shouldDeferScheduled()).toBe(false);
  });

  it('is always NORMAL and never defers when disabled', () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor({ ...baseOpts, enabled: false }, { now: c.now, sleep: c.sleep });
    expect(g.state()).toBe('NORMAL');
    expect(g.shouldDeferScheduled()).toBe(false);
  });
});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('OllamaThrottleGovernor — run() serialization & cooling', () => {
  it('passes through fn result without serializing when disabled', async () => {
    const g = new OllamaThrottleGovernor({ ...baseOpts, enabled: false });
    const r = await g.run('embeddings', 'bge-m3', async () => 42);
    expect(r).toBe(42);
  });

  it('serializes concurrent requests (one in-flight at a time)', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000); // start-slow COOLING を抜ける
    const events: string[] = [];
    let resolveA!: () => void;
    const a = g.run('embeddings', 'bge-m3', () => {
      events.push('A:start');
      return new Promise<number>((res) => {
        resolveA = () => {
          events.push('A:end');
          res(1);
        };
      });
    });
    const b = g.run('embeddings', 'bge-m3', async () => {
      events.push('B:start');
      return 2;
    });
    await tick();
    await tick();
    expect(events).toEqual(['A:start']); // B は A 完了まで開始しない
    resolveA();
    await Promise.all([a, b]);
    expect(events).toEqual(['A:start', 'A:end', 'B:start']);
  });

  it('waits out the start-slow COOLING window before running', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    let ran = false;
    await g.run('embeddings', 'bge-m3', async () => {
      ran = true;
      return 0;
    });
    expect(ran).toBe(true);
    expect(c.now()).toBeGreaterThanOrEqual(30_000); // cooling を寝て抜けた
  });
});
