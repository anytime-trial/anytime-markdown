import { appendLogsToRing, applyClientFilter } from '../useLogsDataSource';
import type { LogEntry } from '../../c4/hooks/c4WsMessages';

const entry = (id: number, overrides: Partial<LogEntry> = {}): LogEntry => ({
  id,
  timestamp: `2026-05-13T12:00:0${id}.000Z`,
  level: 'info',
  source: 'extension',
  component: 'C',
  message: `m${id}`,
  metadata: null,
  stack: null,
  ...overrides,
});

describe('appendLogsToRing', () => {
  it('keeps order and drops oldest when over max', () => {
    const ring = [entry(1), entry(2), entry(3)];
    const next = appendLogsToRing(ring, [entry(4), entry(5)], 4);
    expect(next.map((e) => e.id)).toEqual([2, 3, 4, 5]);
  });

  it('does not modify ring below max', () => {
    const ring = [entry(1), entry(2)];
    const next = appendLogsToRing(ring, [entry(3)], 5);
    expect(next.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('uses RING_MAX (1000) by default', () => {
    const ring = Array.from({ length: 999 }, (_, i) => entry(i + 1));
    const next = appendLogsToRing(ring, [entry(1000), entry(1001)]);
    expect(next).toHaveLength(1000);
    expect(next[0].id).toBe(2);
    expect(next[next.length - 1].id).toBe(1001);
  });
});

describe('applyClientFilter', () => {
  const logs: LogEntry[] = [
    entry(1, { level: 'debug' }),
    entry(2, { level: 'info', message: 'memory pause' }),
    entry(3, { level: 'error', source: 'daemon' }),
  ];

  it('filters by level', () => {
    const r = applyClientFilter(logs, {
      level: ['error'],
      source: ['extension', 'daemon'],
      q: '',
    });
    expect(r.map((e) => e.id)).toEqual([3]);
  });

  it('filters by source', () => {
    const r = applyClientFilter(logs, {
      level: ['debug', 'info', 'warn', 'error'],
      source: ['daemon'],
      q: '',
    });
    expect(r.map((e) => e.id)).toEqual([3]);
  });

  it('filters by search query (case-insensitive LIKE on message and component)', () => {
    const r = applyClientFilter(logs, {
      level: ['debug', 'info', 'warn', 'error'],
      source: ['extension', 'daemon'],
      q: 'MEMORY',
    });
    expect(r.map((e) => e.id)).toEqual([2]);
  });

  it('returns empty when no level matches', () => {
    const r = applyClientFilter(logs, {
      level: [],
      source: ['extension', 'daemon'],
      q: '',
    });
    expect(r).toEqual([]);
  });

  it('matches against component name', () => {
    const withComp = [entry(10, { component: 'MemoryCore' })];
    const r = applyClientFilter(withComp, {
      level: ['debug', 'info', 'warn', 'error'],
      source: ['extension', 'daemon'],
      q: 'memorycore',
    });
    expect(r).toHaveLength(1);
  });
});
