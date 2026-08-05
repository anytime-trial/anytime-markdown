/**
 * Additional coverage for LogService.queryLogs filters.
 * Complements the existing LogService.test.ts.
 */
import { LogService, type LogEntry } from '../LogService';
import { makeLogService } from './logServiceTestUtils';

const broadcaster = { notifyLog: jest.fn() };

function makeSvc(): LogService {
  return makeLogService(broadcaster);
}

function entry(
  ts: string,
  level: LogEntry['level'],
  component = 'Comp',
  message = 'msg',
  extra: Partial<LogEntry> = {},
): LogEntry {
  return { timestamp: ts, level, component, message, ...extra };
}

describe('LogService.queryLogs — additional filter coverage', () => {
  beforeEach(() => broadcaster.notifyLog.mockClear());

  it('filters by source', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:01.000Z', 'info')], 'daemon');

    const { logs } = svc.queryLogs({ source: ['daemon'] });
    expect(logs).toHaveLength(1);
    expect(logs[0].source).toBe('daemon');
  });

  it('filters by multiple sources', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:01.000Z', 'warn')], 'daemon');

    const { logs } = svc.queryLogs({ source: ['extension', 'daemon'] });
    expect(logs).toHaveLength(2);
  });

  it('filters by text query (q) — matches message', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info', 'Comp', 'hello world')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:01.000Z', 'info', 'Comp', 'goodbye')], 'extension');

    const { logs } = svc.queryLogs({ q: 'hello' });
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('hello world');
  });

  it('filters by text query (q) — matches component', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info', 'SpecialComp', 'some message')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:01.000Z', 'info', 'OtherComp', 'other message')], 'extension');

    const { logs } = svc.queryLogs({ q: 'Special' });
    expect(logs).toHaveLength(1);
    expect(logs[0].component).toBe('SpecialComp');
  });

  it('filters by since (inclusive)', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T10:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T14:00:00.000Z', 'info')], 'extension');

    const { logs } = svc.queryLogs({ since: '2026-05-13T12:00:00.000Z' });
    expect(logs.every((l) => l.timestamp >= '2026-05-13T12:00:00.000Z')).toBe(true);
    expect(logs).toHaveLength(2);
  });

  it('filters by until (exclusive)', () => {
    const svc = makeSvc();
    svc.insertBatch([entry('2026-05-13T10:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T12:00:00.000Z', 'info')], 'extension');
    svc.insertBatch([entry('2026-05-13T14:00:00.000Z', 'info')], 'extension');

    const { logs } = svc.queryLogs({ until: '2026-05-13T12:00:00.000Z' });
    expect(logs.every((l) => l.timestamp < '2026-05-13T12:00:00.000Z')).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it('cursor-based pagination works', () => {
    const svc = makeSvc();
    // Insert 5 entries ordered by timestamp
    for (let i = 0; i < 5; i++) {
      svc.insertBatch(
        [entry(`2026-05-13T12:00:0${i}.000Z`, 'info', 'C', `msg ${i}`)],
        'extension',
      );
    }

    // Page 1: limit=3, newest first
    const page1 = svc.queryLogs({ limit: 3 });
    expect(page1.logs).toHaveLength(3);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2: use cursor from page1
    const page2 = svc.queryLogs({ limit: 3, cursor: page1.nextCursor ?? undefined });
    expect(page2.logs).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });

  it('returns metadata as parsed object', () => {
    const svc = makeSvc();
    svc.insertBatch(
      [entry('2026-05-13T12:00:00.000Z', 'info', 'C', 'm', { metadata: { key: 'val' } })],
      'extension',
    );
    const { logs } = svc.queryLogs({});
    expect(logs[0].metadata).toEqual({ key: 'val' });
  });

  it('returns stack as string when present', () => {
    const svc = makeSvc();
    svc.insertBatch(
      [entry('2026-05-13T12:00:00.000Z', 'error', 'C', 'm', { stack: 'Error: boom\n  at x' })],
      'extension',
    );
    const { logs } = svc.queryLogs({});
    expect(logs[0].stack).toBe('Error: boom\n  at x');
  });

  it('returns null metadata and stack when absent', () => {
    const svc = makeSvc();
    svc.insertBatch(
      [entry('2026-05-13T12:00:00.000Z', 'info', 'C', 'm')],
      'extension',
    );
    const { logs } = svc.queryLogs({});
    expect(logs[0].metadata).toBeNull();
    expect(logs[0].stack).toBeNull();
  });
});
