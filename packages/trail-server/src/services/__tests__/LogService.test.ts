import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { LogService, type LogEntry } from '../LogService';
import { makeLogDb, SYSTEM_RUN_ID } from './logServiceTestUtils';

const broadcaster = { notifyLog: jest.fn() };

describe('LogService', () => {
  beforeEach(() => broadcaster.notifyLog.mockClear());

  it('inserts a batch of logs and broadcasts them', () => {
    const db = makeLogDb();
    const svc = new LogService(db, broadcaster, SYSTEM_RUN_ID);
    const logs: LogEntry[] = [
      { timestamp: '2026-05-13T12:34:56.789Z', level: 'info', component: 'TrailLogger', message: 'activated' },
      { timestamp: '2026-05-13T12:34:57.000Z', level: 'error', component: 'TrailLogger', message: 'boom', stack: 'Error: x\n  at f' },
    ];
    svc.insertBatch(logs, 'extension');

    const result = db.exec('SELECT * FROM pipeline_run_logs ORDER BY id');
    expect(result[0]?.values).toHaveLength(2);
    const sourceIdx = result[0]?.columns.indexOf('source') ?? -1;
    const levelIdx = result[0]?.columns.indexOf('level') ?? -1;
    const stackIdx = result[0]?.columns.indexOf('stack') ?? -1;
    expect(result[0]?.values[0]?.[sourceIdx]).toBe('extension');
    expect(result[0]?.values[0]?.[levelIdx]).toBe('info');
    expect(result[0]?.values[1]?.[stackIdx]).toBe('Error: x\n  at f');
    expect(broadcaster.notifyLog).toHaveBeenCalledTimes(1);
    expect(broadcaster.notifyLog.mock.calls[0][0]).toHaveLength(2);
    expect(broadcaster.notifyLog.mock.calls[0][0][0].source).toBe('extension');
  });

  it('serializes metadata as JSON', () => {
    const db = makeLogDb();
    const svc = new LogService(db, broadcaster, SYSTEM_RUN_ID);
    svc.insertBatch(
      [{ timestamp: '2026-05-13T12:00:00.000Z', level: 'info', component: 'X', message: 'm', metadata: { a: 1, b: ['x'] } }],
      'daemon',
    );
    const result = db.exec('SELECT metadata FROM pipeline_run_logs');
    const metadata = result[0]?.values[0]?.[0];
    expect(JSON.parse(String(metadata))).toEqual({ a: 1, b: ['x'] });
  });

  it('rejects invalid level via CHECK constraint', () => {
    const db = makeLogDb();
    const svc = new LogService(db, broadcaster, SYSTEM_RUN_ID);
    expect(() =>
      svc.insertBatch(
        [{ timestamp: '2026-05-13T12:00:00.000Z', level: 'trace' as never, component: 'X', message: 'm' }],
        'extension',
      ),
    ).toThrow();
  });

  it('queryLogs returns rows filtered by level and time range, paged by cursor', () => {
    const db = makeLogDb();
    const svc = new LogService(db, broadcaster, SYSTEM_RUN_ID);
    for (let i = 0; i < 5; i++) {
      svc.insertBatch(
        [{
          timestamp: `2026-05-13T12:00:0${i}.000Z`,
          level: i % 2 === 0 ? 'info' : 'error',
          component: 'X',
          message: `msg ${i}`,
        }],
        'extension',
      );
    }
    const { logs, nextCursor } = svc.queryLogs({ level: ['error'], limit: 10 });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.level === 'error')).toBe(true);
    expect(nextCursor).toBeNull();
  });
});
