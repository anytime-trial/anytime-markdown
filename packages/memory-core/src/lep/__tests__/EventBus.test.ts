import { EventBus } from '../EventBus';
import type { Analyzer, AnalyzerContext, AnalyzerEvent } from '../types';

const noopCtx = (bus: EventBus): AnalyzerContext => ({
  runId: 'test-run',
  reason: 'manual',
  logger: { info: () => undefined, error: () => undefined },
  bus,
});

function makeAnalyzer(
  id: string,
  subscribes: AnalyzerEvent['kind'][],
  onEvent: (e: AnalyzerEvent, ctx: AnalyzerContext) => Promise<void>,
): Analyzer {
  return {
    id,
    tier: 2,
    subscribes,
    onEvent,
  };
}

describe('EventBus', () => {
  it('publish dispatches to subscribers of matching kind only', async () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe(
      makeAnalyzer('A', ['wave_complete'], async (e) => {
        if (e.kind === 'wave_complete') events.push(`A:${e.wave}`);
      }),
    );
    bus.subscribe(
      makeAnalyzer('B', ['wave_skipped'], async (e) => {
        if (e.kind === 'wave_skipped') events.push(`B:${e.wave}`);
      }),
    );

    bus.beginRun(noopCtx(bus));
    await bus.publish({ kind: 'wave_complete', wave: 'primary' });
    await bus.publish({ kind: 'wave_skipped', wave: 'memory', reason: 'disabled' });
    bus.endRun();

    expect(events).toEqual(['A:primary', 'B:memory']);
  });

  it('publish before beginRun is a no-op (defensive)', async () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(
      makeAnalyzer('A', ['wave_complete'], async () => {
        called = true;
      }),
    );
    await bus.publish({ kind: 'wave_complete', wave: 'primary' });
    expect(called).toBe(false);
  });

  it('publish awaits each subscriber sequentially in subscribe order', async () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe(
      makeAnalyzer('A', ['wave_complete'], async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push('A');
      }),
    );
    bus.subscribe(
      makeAnalyzer('B', ['wave_complete'], async () => {
        order.push('B');
      }),
    );

    bus.beginRun(noopCtx(bus));
    await bus.publish({ kind: 'wave_complete', wave: 'primary' });
    bus.endRun();

    expect(order).toEqual(['A', 'B']);
  });

  it('collects subscriber errors via errorCollector instead of throwing', async () => {
    const bus = new EventBus();
    bus.subscribe(
      makeAnalyzer('A', ['wave_complete'], async () => {
        throw new Error('boom A');
      }),
    );
    bus.subscribe(
      makeAnalyzer('B', ['wave_complete'], async () => {
        // B should still run after A throws
      }),
    );

    const errors = new Map<string, Error>();
    bus.beginRun(noopCtx(bus), errors);
    await expect(
      bus.publish({ kind: 'wave_complete', wave: 'primary' }),
    ).resolves.toBeUndefined();
    bus.endRun();

    expect(errors.get('A')?.message).toBe('boom A');
    expect(errors.has('B')).toBe(false);
  });

  it('re-throws subscriber errors when no errorCollector is set', async () => {
    const bus = new EventBus();
    bus.subscribe(
      makeAnalyzer('A', ['wave_complete'], async () => {
        throw new Error('boom A');
      }),
    );

    bus.beginRun(noopCtx(bus));
    await expect(
      bus.publish({ kind: 'wave_complete', wave: 'primary' }),
    ).rejects.toThrow('boom A');
    bus.endRun();
  });

  it('subscriberCount reflects subscribe calls', () => {
    const bus = new EventBus();
    expect(bus.subscriberCount('wave_complete')).toBe(0);
    bus.subscribe(makeAnalyzer('A', ['wave_complete'], async () => undefined));
    bus.subscribe(makeAnalyzer('B', ['wave_complete', 'wave_skipped'], async () => undefined));
    expect(bus.subscriberCount('wave_complete')).toBe(2);
    expect(bus.subscriberCount('wave_skipped')).toBe(1);
  });
});
