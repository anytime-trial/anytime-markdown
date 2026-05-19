import { EventBus } from '../EventBus';
import { LepOrchestrator } from '../LepOrchestrator';
import type { Analyzer, AnalyzerContext, AnalyzerEvent } from '../types';

function makeTier2(
  id: string,
  hooks: Partial<Pick<Analyzer, 'onRunStart' | 'onRunEnd' | 'onEvent'>> = {},
): Analyzer {
  return {
    id,
    tier: 2,
    subscribes: [],
    ...hooks,
  };
}

function makeMemorySubscriber(
  id: string,
  onPrimaryComplete: (ctx: AnalyzerContext) => Promise<void>,
): Analyzer {
  return {
    id,
    tier: 3,
    subscribes: ['wave_complete'],
    onEvent: async (e, ctx) => {
      if (e.kind === 'wave_complete' && e.wave === 'primary') {
        await onPrimaryComplete(ctx);
      }
    },
  };
}

describe('LepOrchestrator', () => {
  it('runs Wave 2 (tier=2) before Wave 3 (tier=3) onRunEnd', async () => {
    const bus = new EventBus();
    const order: string[] = [];
    const a = makeTier2('A', { onRunEnd: async () => { order.push('A.runEnd'); } });
    const b: Analyzer = {
      id: 'B',
      tier: 3,
      subscribes: [],
      onRunEnd: async () => { order.push('B.runEnd'); },
    };
    bus.subscribe(a);
    bus.subscribe(b);

    const orch = new LepOrchestrator(bus, [a, b]);
    const result = await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(order).toEqual(['A.runEnd', 'B.runEnd']);
    expect(result.errors.size).toBe(0);
  });

  it('publishes wave_complete events in order: sources, primary, memory, derived', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const listener: Analyzer = {
      id: 'L',
      tier: 4,
      subscribes: ['wave_complete'],
      onEvent: async (e) => {
        if (e.kind === 'wave_complete') seen.push(e.wave);
      },
    };
    bus.subscribe(listener);

    const orch = new LepOrchestrator(bus, [listener]);
    await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(seen).toEqual(['sources', 'primary', 'memory', 'derived']);
  });

  it('triggers Wave 3 event subscriber after Wave 2 onRunEnd completes', async () => {
    const bus = new EventBus();
    const order: string[] = [];
    const tier2 = makeTier2('I', { onRunEnd: async () => { order.push('importAll'); } });
    const tier3 = makeMemorySubscriber('M', async () => {
      order.push('memory-core');
    });
    bus.subscribe(tier3);

    const orch = new LepOrchestrator(bus, [tier2, tier3]);
    await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(order).toEqual(['importAll', 'memory-core']);
  });

  it('collects errors thrown by onRunEnd without stopping the pipeline', async () => {
    const bus = new EventBus();
    const sawMemory: { called: boolean } = { called: false };
    const tier2: Analyzer = {
      id: 'I',
      tier: 2,
      subscribes: [],
      onRunEnd: async () => {
        throw new Error('boom-import');
      },
    };
    const tier3 = makeMemorySubscriber('M', async () => {
      sawMemory.called = true;
    });
    bus.subscribe(tier3);

    const orch = new LepOrchestrator(bus, [tier2, tier3]);
    const result = await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(result.errors.get('I')?.message).toBe('boom-import');
    expect(sawMemory.called).toBe(true); // memory-core still ran via wave_complete:primary
  });

  it('collects errors thrown by onEvent subscribers via errorCollector', async () => {
    const bus = new EventBus();
    const tier3 = makeMemorySubscriber('M', async () => {
      throw new Error('boom-mem');
    });
    bus.subscribe(tier3);

    const orch = new LepOrchestrator(bus, [tier3]);
    const result = await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(result.errors.get('M')?.message).toBe('boom-mem');
  });

  it('combines onRunEnd error and onEvent error from different analyzers', async () => {
    const bus = new EventBus();
    const tier2: Analyzer = {
      id: 'I',
      tier: 2,
      subscribes: [],
      onRunEnd: async () => {
        throw new Error('boom-import');
      },
    };
    const tier3 = makeMemorySubscriber('M', async () => {
      throw new Error('boom-mem');
    });
    bus.subscribe(tier3);

    const orch = new LepOrchestrator(bus, [tier2, tier3]);
    const result = await orch.runOnce({ runId: 'r1', reason: 'manual' });

    expect(result.errors.get('I')?.message).toBe('boom-import');
    expect(result.errors.get('M')?.message).toBe('boom-mem');
  });

  it('passes reason and runId through AnalyzerContext', async () => {
    const bus = new EventBus();
    let capturedReason: string | null = null;
    let capturedRunId: string | null = null;
    const a: Analyzer = {
      id: 'A',
      tier: 2,
      subscribes: [],
      onRunEnd: async (ctx) => {
        capturedReason = ctx.reason;
        capturedRunId = ctx.runId;
      },
    };

    const orch = new LepOrchestrator(bus, [a]);
    await orch.runOnce({ runId: 'run-xyz', reason: 'periodic' });

    expect(capturedReason).toBe('periodic');
    expect(capturedRunId).toBe('run-xyz');
  });

  it('handles empty analyzers (just publishes wave events)', async () => {
    const bus = new EventBus();
    const orch = new LepOrchestrator(bus, []);
    const result = await orch.runOnce({ runId: 'r1', reason: 'manual' });
    expect(result.errors.size).toBe(0);
  });
});
