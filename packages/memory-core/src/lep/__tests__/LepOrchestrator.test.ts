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

  describe('Wave 1 (Ingester) flow', () => {
    it('runs tier=1 onRunStart before tier=2 onRunEnd', async () => {
      const bus = new EventBus();
      const order: string[] = [];
      const ingester: Analyzer = {
        id: 'I',
        tier: 1,
        subscribes: [],
        onRunStart: async () => {
          order.push('I.start');
        },
      };
      const primary: Analyzer = {
        id: 'P',
        tier: 2,
        subscribes: [],
        onRunEnd: async () => {
          order.push('P.end');
        },
      };

      const orch = new LepOrchestrator(bus, [ingester, primary]);
      await orch.runOnce({ runId: 'r1', reason: 'manual' });

      expect(order).toEqual(['I.start', 'P.end']);
    });

    it('delivers events emitted from tier=1 onRunStart to tier=2 onEvent subscribers', async () => {
      const bus = new EventBus();
      const received: string[] = [];

      const ingester: Analyzer = {
        id: 'I',
        tier: 1,
        subscribes: [],
        emits: ['jsonl_session_discovered'],
        onRunStart: async (ctx) => {
          await ctx.bus.publish({
            kind: 'jsonl_session_discovered',
            sessionId: 'sid-1',
            mainFile: '/tmp/a.jsonl',
            subagentFiles: [],
            repoName: 'r',
            source: 'claude_code',
            fileSize: 10,
            hasMessages: false,
            hasUsableCostData: false,
          });
        },
      };
      const subscriber: Analyzer = {
        id: 'S',
        tier: 2,
        subscribes: ['jsonl_session_discovered'],
        onEvent: async (e) => {
          if (e.kind === 'jsonl_session_discovered') received.push(e.sessionId);
        },
      };
      bus.subscribe(subscriber);

      const orch = new LepOrchestrator(bus, [ingester, subscriber]);
      await orch.runOnce({ runId: 'r1', reason: 'manual' });

      expect(received).toEqual(['sid-1']);
    });

    it('drains chained event handlers (subscriber A emits event subscribed by subscriber B)', async () => {
      const bus = new EventBus();
      const seen: string[] = [];

      // Ingester emits git_commit
      const ingester: Analyzer = {
        id: 'I',
        tier: 1,
        subscribes: [],
        onRunStart: async (ctx) => {
          await ctx.bus.publish({
            kind: 'git_commit',
            repo: 'r',
            hash: 'h1',
            committedAt: '2026-05-19T00:00:00.000Z',
            author: 'a',
            message: 'm',
          });
        },
      };
      // Layer 2: git_commit を受けたら release_resolved を 1 件 emit する連鎖
      const chained: Analyzer = {
        id: 'C',
        tier: 2,
        subscribes: ['git_commit'],
        onEvent: async (_e, ctx) => {
          seen.push('C');
          await ctx.bus.publish({
            kind: 'release_resolved',
            tag: 'v1',
            releasedAt: '2026-05-19T00:00:00.000Z',
          });
        },
      };
      const downstream: Analyzer = {
        id: 'D',
        tier: 2,
        subscribes: ['release_resolved'],
        onEvent: async (_e) => {
          seen.push('D');
        },
      };
      bus.subscribe(chained);
      bus.subscribe(downstream);

      const orch = new LepOrchestrator(bus, [ingester, chained, downstream]);
      await orch.runOnce({ runId: 'r1', reason: 'manual' });

      expect(seen).toEqual(['C', 'D']);
    });

    it('publishes wave_complete:sources after Wave 1 finishes', async () => {
      const bus = new EventBus();
      const waveEvents: string[] = [];
      bus.subscribe({
        id: 'L',
        tier: 4,
        subscribes: ['wave_complete'],
        onEvent: async (e) => {
          if (e.kind === 'wave_complete') waveEvents.push(e.wave);
        },
      });

      const orch = new LepOrchestrator(bus, []);
      await orch.runOnce({ runId: 'r1', reason: 'manual' });

      expect(waveEvents[0]).toBe('sources');
    });
  });
});

describe('LepOrchestrator stage control (Step 3d)', () => {
  /** publish された wave_start / wave_complete を記録する観測 analyzer。 */
  function makeWaveObserver(events: string[]): Analyzer {
    return {
      id: 'observer',
      tier: 4,
      subscribes: ['wave_start', 'wave_complete'],
      onEvent: async (e: AnalyzerEvent) => {
        if (e.kind === 'wave_start') events.push(`start:${e.wave}`);
        if (e.kind === 'wave_complete') events.push(`complete:${e.wave}`);
      },
    };
  }

  it('default (no stage) runs all 4 waves with wave_start before wave_complete', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    const obs = makeWaveObserver(events);
    bus.subscribe(obs);
    await new LepOrchestrator(bus, [obs]).runOnce({ runId: 'r', reason: 'manual' });
    expect(events).toEqual([
      'start:sources', 'complete:sources',
      'start:primary', 'complete:primary',
      'start:memory', 'complete:memory',
      'start:derived', 'complete:derived',
    ]);
  });

  it('stage=primary runs only sources + primary waves', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    const obs = makeWaveObserver(events);
    bus.subscribe(obs);
    await new LepOrchestrator(bus, [obs]).runOnce({ runId: 'r', reason: 'manual', stage: 'primary' });
    expect(events).toEqual(['start:sources', 'complete:sources', 'start:primary', 'complete:primary']);
  });

  it('stage=memory runs only the memory wave', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    const obs = makeWaveObserver(events);
    bus.subscribe(obs);
    await new LepOrchestrator(bus, [obs]).runOnce({ runId: 'r', reason: 'manual', stage: 'memory' });
    expect(events).toEqual(['start:memory', 'complete:memory']);
  });

  it('stage=disabled runs no waves', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    const obs = makeWaveObserver(events);
    bus.subscribe(obs);
    await new LepOrchestrator(bus, [obs]).runOnce({ runId: 'r', reason: 'manual', stage: 'disabled' });
    expect(events).toEqual([]);
  });

  it('stage=sources runs only the sources wave', async () => {
    const events: string[] = [];
    const bus = new EventBus();
    const obs = makeWaveObserver(events);
    bus.subscribe(obs);
    await new LepOrchestrator(bus, [obs]).runOnce({ runId: 'r', reason: 'manual', stage: 'sources' });
    expect(events).toEqual(['start:sources', 'complete:sources']);
  });

  it('wave_start:memory fires a tier-3 subscriber even when stage=memory (Wave 1/2 skipped)', async () => {
    const fired: string[] = [];
    const memAnalyzer: Analyzer = {
      id: 'mem',
      tier: 3,
      subscribes: ['wave_start'],
      onEvent: async (e: AnalyzerEvent) => {
        if (e.kind === 'wave_start' && e.wave === 'memory') fired.push('mem-ran');
      },
    };
    const bus = new EventBus();
    bus.subscribe(memAnalyzer);
    await new LepOrchestrator(bus, [memAnalyzer]).runOnce({ runId: 'r', reason: 'manual', stage: 'memory' });
    expect(fired).toEqual(['mem-ran']);
  });

  it('PersistAnalyzer-style tier-2 onRunEnd completes before wave_start:memory (barrier)', async () => {
    const order: string[] = [];
    const persist: Analyzer = {
      id: 'persist',
      tier: 2,
      subscribes: [],
      onRunEnd: async () => { order.push('save'); },
    };
    const mem: Analyzer = {
      id: 'mem',
      tier: 3,
      subscribes: ['wave_start'],
      onEvent: async (e: AnalyzerEvent) => {
        if (e.kind === 'wave_start' && e.wave === 'memory') order.push('memory-attach');
      },
    };
    const bus = new EventBus();
    bus.subscribe(persist);
    bus.subscribe(mem);
    await new LepOrchestrator(bus, [persist, mem]).runOnce({
      runId: 'r',
      reason: 'manual',
      stage: 'primary+memory',
    });
    expect(order).toEqual(['save', 'memory-attach']);
  });

  it('initializes a tier-2 consumer (onRunStart) before a tier-1 ingester emits events it consumes', async () => {
    // Regression: JsonlIngester (tier 1) が Wave 1 で jsonl_session_discovered を emit し、
    // SessionImporter (tier 2) が消費する。SessionImporter は onRunStart で importedFiles を
    // 初期化し、未初期化なら onEvent を早期 return する (`if (!this.importedFiles) return;`)。
    // 旧 orchestrator は tier 順に Wave を回し各 tier 内で onRunStart→onRunEnd するため、
    // tier-2 consumer の onRunStart が tier-1 producer の emit より後になり、import が 0 件になる。
    const bus = new EventBus();
    const recorded: string[] = [];

    const ingester: Analyzer = {
      id: 'FakeIngester',
      tier: 1,
      subscribes: [],
      emits: ['jsonl_session_discovered'],
      onRunEnd: async (ctx) => {
        await ctx.bus.publish({
          kind: 'jsonl_session_discovered',
          sessionId: 's1',
          mainFile: '/x/s1.jsonl',
          subagentFiles: [],
          repoName: 'r',
          source: 'claude_code',
          fileSize: 1,
          hasMessages: false,
          hasUsableCostData: false,
        });
      },
    };

    let initialized = false;
    const consumer: Analyzer = {
      id: 'FakeConsumer',
      tier: 2,
      subscribes: ['jsonl_session_discovered'],
      onRunStart: async () => {
        initialized = true;
      },
      onEvent: async (e) => {
        if (e.kind !== 'jsonl_session_discovered') return;
        if (!initialized) return; // SessionImporter の importedFiles ガードを模倣
        recorded.push(e.sessionId);
      },
    };

    bus.subscribe(consumer);
    await new LepOrchestrator(bus, [ingester, consumer]).runOnce({
      runId: 'r',
      reason: 'manual',
      stage: 'primary',
    });

    expect(recorded).toEqual(['s1']);
  });
});
