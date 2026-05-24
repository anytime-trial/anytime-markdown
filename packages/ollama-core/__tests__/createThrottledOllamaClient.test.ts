import { createThrottledOllamaClient } from '../src/throttle/createThrottledOllamaClient';
import { OllamaThrottleGovernor } from '../src/throttle/OllamaThrottleGovernor';
import type { OllamaClient } from '../src/client';

function fakeClock(start = 0) {
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

const opts = { enabled: true, slowdownFactor: 1.5, cooldownSec: 30, maxContinuousMin: 15 };

describe('createThrottledOllamaClient', () => {
  it('delegates generate/embeddings through the inner client when disabled', async () => {
    const calls: string[] = [];
    const inner: OllamaClient = {
      generate: async (o) => {
        calls.push(`generate:${o.model}`);
        return { response: 'r' };
      },
      embeddings: async (o) => {
        calls.push(`embeddings:${o.model}`);
        return { embedding: new Float32Array(1024) };
      },
    };
    const g = new OllamaThrottleGovernor({ ...opts, enabled: false });
    const client = createThrottledOllamaClient(inner, g);
    await client.generate({ model: 'qwen', prompt: 'p' });
    await client.embeddings({ model: 'bge-m3', prompt: 'p' });
    expect(calls).toEqual(['generate:qwen', 'embeddings:bge-m3']);
  });

  it('routes embeddings latency into the governor (triggers COOLING)', async () => {
    const c = fakeClock();
    const g = new OllamaThrottleGovernor(opts, { now: c.now, sleep: c.sleep });
    c.advance(30_000);
    let latency = 200;
    const inner: OllamaClient = {
      generate: async () => ({ response: 'r' }),
      embeddings: async () => {
        c.advance(latency);
        return { embedding: new Float32Array(1024) };
      },
    };
    const client = createThrottledOllamaClient(inner, g);
    for (let i = 0; i < 5; i++) await client.embeddings({ model: 'bge-m3', prompt: 'p' });
    latency = 400;
    await client.embeddings({ model: 'bge-m3', prompt: 'p' });
    expect(g.state()).toBe('COOLING');
  });
});
