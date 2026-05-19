/**
 * Additional coverage for LogService.queryLogs filters and cleanup().
 * Complements the existing LogService.test.ts.
 */
import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { LogService, type LogEntry } from '../LogService';

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(CREATE_EXTENSION_LOGS);
  for (const idx of CREATE_EXTENSION_LOGS_INDEXES) db.run(idx);
  return db;
}

const broadcaster = { notifyLog: jest.fn() };

function makeSvc(): LogService {
  const db = makeDb();
  return new LogService(db, broadcaster);
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

describe('LogService.cleanup', () => {
  beforeEach(() => broadcaster.notifyLog.mockClear());

  it('deletes debug logs older than 3 days', () => {
    const svc = makeSvc();
    const old = new Date('2020-01-01T00:00:00.000Z').toISOString();
    svc.insertBatch([{ timestamp: old, level: 'debug', component: 'C', message: 'old debug' }], 'extension');
    svc.insertBatch([{ timestamp: new Date().toISOString(), level: 'debug', component: 'C', message: 'recent debug' }], 'extension');

    svc.cleanup(new Date());
    const { logs } = svc.queryLogs({ level: ['debug'] });
    // The very old log should be deleted, recent one stays
    expect(logs.some((l) => l.message === 'old debug')).toBe(false);
    expect(logs.some((l) => l.message === 'recent debug')).toBe(true);
  });

  it('deletes info logs older than 30 days', () => {
    const svc = makeSvc();
    const old = new Date('2020-01-01T00:00:00.000Z').toISOString();
    svc.insertBatch([{ timestamp: old, level: 'info', component: 'C', message: 'old info' }], 'extension');

    svc.cleanup(new Date());
    const { logs } = svc.queryLogs({ level: ['info'] });
    expect(logs.some((l) => l.message === 'old info')).toBe(false);
  });

  it('deletes warn/error logs older than 90 days', () => {
    const svc = makeSvc();
    const old = new Date('2020-01-01T00:00:00.000Z').toISOString();
    svc.insertBatch([{ timestamp: old, level: 'warn', component: 'C', message: 'old warn' }], 'extension');
    svc.insertBatch([{ timestamp: old, level: 'error', component: 'C', message: 'old error' }], 'extension');

    svc.cleanup(new Date());
    const { logs } = svc.queryLogs({ level: ['warn', 'error'] });
    expect(logs).toHaveLength(0);
  });

  it('does not delete recent logs', () => {
    const svc = makeSvc();
    const now = new Date().toISOString();
    svc.insertBatch([{ timestamp: now, level: 'error', component: 'C', message: 'recent error' }], 'extension');

    svc.cleanup(new Date());
    const { logs } = svc.queryLogs({ level: ['error'] });
    expect(logs).toHaveLength(1);
  });
});
