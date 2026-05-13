import Database from 'better-sqlite3';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { LogService, type LogEntry } from '../LogService';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_EXTENSION_LOGS);
  for (const idx of CREATE_EXTENSION_LOGS_INDEXES) db.exec(idx);
  return db;
}

const broadcaster = { notifyLog: jest.fn() };

describe('LogService', () => {
  beforeEach(() => broadcaster.notifyLog.mockClear());

  it('inserts a batch of logs and broadcasts them', () => {
    const db = makeDb();
    const svc = new LogService(db, broadcaster as never);
    const logs: LogEntry[] = [
      { timestamp: '2026-05-13T12:34:56.789Z', level: 'info', component: 'TrailLogger', message: 'activated' },
      { timestamp: '2026-05-13T12:34:57.000Z', level: 'error', component: 'TrailLogger', message: 'boom', stack: 'Error: x\n  at f' },
    ];
    svc.insertBatch(logs, 'extension');

    const rows = db.prepare('SELECT * FROM extension_logs ORDER BY id').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('extension');
    expect(rows[0].level).toBe('info');
    expect(rows[1].stack).toBe('Error: x\n  at f');
    expect(broadcaster.notifyLog).toHaveBeenCalledTimes(1);
    expect(broadcaster.notifyLog.mock.calls[0][0]).toHaveLength(2);
    expect((broadcaster.notifyLog.mock.calls[0][0] as Array<{ source: string }>)[0].source).toBe('extension');
  });

  it('serializes metadata as JSON', () => {
    const db = makeDb();
    const svc = new LogService(db, broadcaster as never);
    svc.insertBatch(
      [{ timestamp: '2026-05-13T12:00:00.000Z', level: 'info', component: 'X', message: 'm', metadata: { a: 1, b: ['x'] } }],
      'daemon',
    );
    const row = db.prepare('SELECT metadata FROM extension_logs').get() as { metadata: string };
    expect(JSON.parse(row.metadata)).toEqual({ a: 1, b: ['x'] });
  });

  it('rejects invalid level via CHECK constraint', () => {
    const db = makeDb();
    const svc = new LogService(db, broadcaster as never);
    expect(() =>
      svc.insertBatch(
        [{ timestamp: '2026-05-13T12:00:00.000Z', level: 'trace' as never, component: 'X', message: 'm' }],
        'extension',
      ),
    ).toThrow();
  });

  it('queryLogs returns rows filtered by level and time range, paged by cursor', () => {
    const db = makeDb();
    const svc = new LogService(db, broadcaster as never);
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
