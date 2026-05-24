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

describe('OllamaThrottleGovernor — embeddings latency detection', () => {
  async function runWithLatency(
    g: OllamaThrottleGovernor,
    c: ReturnType<typeof fakeClock>,
    op: 'generate' | 'embeddings',
    model: string,
    latencyMs: number,
  ) {
    return g.run(op, model, async () => {
      c.advance(latencyMs);
      return 0;
    });
  }

  it('enters COOLING when an embeddings request exceeds baseline×slowdownFactor', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    for (let i = 0; i < 5; i++) await runWithLatency(g, c, 'embeddings', 'bge-m3', 200); // baseline ≈ 200
    expect(g.state()).toBe('NORMAL');
    await runWithLatency(g, c, 'embeddings', 'bge-m3', 400); // 400 > 200*1.5=300
    expect(g.state()).toBe('COOLING');
  });

  it('does not trigger before MIN_SAMPLES baseline is established', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    await runWithLatency(g, c, 'embeddings', 'bge-m3', 5000); // 初回は seed のみ
    expect(g.state()).toBe('NORMAL');
  });

  it('ignores generate latency for detection', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    for (let i = 0; i < 10; i++) await runWithLatency(g, c, 'generate', 'qwen2.5-coder:14b', 60_000);
    expect(g.state()).toBe('NORMAL'); // generate は検知素材にしない
  });
});

describe('OllamaThrottleGovernor — error & continuous-time triggers', () => {
  it('enters COOLING on ollama_timeout', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    await expect(
      g.run('embeddings', 'bge-m3', async () => {
        const e = new Error('ollama_timeout') as Error & { code: string };
        e.code = 'ollama_timeout';
        throw e;
      }),
    ).rejects.toThrow();
    expect(g.state()).toBe('COOLING');
  });

  it('does not enter COOLING on an unrelated error', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    await expect(
      g.run('embeddings', 'bge-m3', async () => {
        const e = new Error('model_not_pulled') as Error & { code: string };
        e.code = 'model_not_pulled';
        throw e;
      }),
    ).rejects.toThrow();
    expect(g.state()).toBe('NORMAL');
  });

  it('enters COOLING after maxContinuousMin of continuous activity', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    await g.run('embeddings', 'bge-m3', async () => 0); // streak 開始
    for (let i = 0; i < 15; i++) {
      c.advance(60_000); // 1 分ごと (= IDLE_RESET_MS、> ではないので streak 継続)
      await g.run('embeddings', 'bge-m3', async () => 0);
    }
    expect(g.state()).toBe('COOLING'); // 15 分連続で強制 COOLING
  });

  it('resets the continuous streak after a long idle gap', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(baseOpts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    await g.run('embeddings', 'bge-m3', async () => 0);
    c.advance(20 * 60_000); // 20 分アイドル (> IDLE_RESET_MS) → streak リセット
    await g.run('embeddings', 'bge-m3', async () => 0);
    expect(g.state()).toBe('NORMAL');
  });
});
