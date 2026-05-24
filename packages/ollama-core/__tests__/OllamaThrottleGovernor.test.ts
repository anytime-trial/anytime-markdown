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
