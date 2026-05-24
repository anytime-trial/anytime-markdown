import { ThrottleStatusWriter } from '../ThrottleStatusWriter';
import type { ThrottleSnapshot } from '@anytime-markdown/agent-core';

const logger = { error: (): void => {} };
function governorOf(snap: ThrottleSnapshot) {
  return { snapshot: (): ThrottleSnapshot => snap };
}

describe('ThrottleStatusWriter.writeIfChanged', () => {
  it('writes when enabled and changed, including updatedAt', () => {
    const writes: Array<{ path: string; data: string }> = [];
    const snap: ThrottleSnapshot = { enabled: true, state: 'NORMAL', entries: [] };
    const w = new ThrottleStatusWriter(governorOf(snap), '/tmp/throttle-status.json', logger, {
      now: () => 1_700_000_000_000,
      writeFile: (path, data) => writes.push({ path, data }),
    });
    expect(w.writeIfChanged()).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/tmp/throttle-status.json');
    const parsed = JSON.parse(writes[0].data) as { state: string; updatedAt: string };
    expect(parsed.state).toBe('NORMAL');
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('does not write when disabled', () => {
    const writes: string[] = [];
    const snap: ThrottleSnapshot = { enabled: false, state: 'NORMAL', entries: [] };
    const w = new ThrottleStatusWriter(governorOf(snap), '/tmp/x.json', logger, {
      now: () => 0,
      writeFile: (_p, d) => writes.push(d),
    });
    expect(w.writeIfChanged()).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('does not write again when the snapshot is unchanged', () => {
    const writes: string[] = [];
    const snap: ThrottleSnapshot = { enabled: true, state: 'NORMAL', entries: [] };
    const w = new ThrottleStatusWriter(governorOf(snap), '/tmp/x.json', logger, {
      now: () => 0,
      writeFile: (_p, d) => writes.push(d),
    });
    expect(w.writeIfChanged()).toBe(true);
    expect(w.writeIfChanged()).toBe(false);
    expect(writes).toHaveLength(1);
  });
});
