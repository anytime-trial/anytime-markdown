import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { LogService } from '../../services/LogService';
import { handlePostLogs, handleGetLogs } from '../logsApi';

function makeService(): { svc: LogService; db: BetterSqlite3MemoryDb; broadcaster: { notifyLog: jest.Mock } } {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(CREATE_EXTENSION_LOGS);
  for (const idx of CREATE_EXTENSION_LOGS_INDEXES) db.run(idx);
  const broadcaster = { notifyLog: jest.fn() };
  return { svc: new LogService(db, broadcaster), db, broadcaster };
}

describe('handlePostLogs', () => {
  it('returns 204 when valid logs are posted', () => {
    const { svc, db } = makeService();
    const body = {
      logs: [{ timestamp: '2026-05-13T12:34:56.789Z', level: 'info', component: 'C', message: 'm' }],
    };
    const res = handlePostLogs(JSON.stringify(body), svc);
    expect(res.status).toBe(204);
    const result = db.exec('SELECT COUNT(*) AS n FROM extension_logs');
    expect(result[0]?.values[0]?.[0]).toBe(1);
  });

  it('returns 400 when level is invalid', () => {
    const { svc } = makeService();
    const body = { logs: [{ timestamp: '2026-05-13T12:00:00.000Z', level: 'trace', component: 'C', message: 'm' }] };
    const res = handlePostLogs(JSON.stringify(body), svc);
    expect(res.status).toBe(400);
  });

  it('returns 400 when timestamp is malformed', () => {
    const { svc } = makeService();
    const body = { logs: [{ timestamp: '2026/05/13 12:00:00', level: 'info', component: 'C', message: 'm' }] };
    const res = handlePostLogs(JSON.stringify(body), svc);
    expect(res.status).toBe(400);
  });

  it('returns 400 when batch exceeds 200', () => {
    const { svc } = makeService();
    const logs = Array.from({ length: 201 }, (_, i) => ({
      timestamp: '2026-05-13T12:00:00.000Z',
      level: 'info' as const,
      component: 'C',
      message: `m${i}`,
    }));
    const res = handlePostLogs(JSON.stringify({ logs }), svc);
    expect(res.status).toBe(400);
  });

  it('returns 400 when JSON is malformed', () => {
    const { svc } = makeService();
    const res = handlePostLogs('{not json', svc);
    expect(res.status).toBe(400);
  });
});

describe('handleGetLogs', () => {
  it('returns logs filtered by level', () => {
    const { svc } = makeService();
    svc.insertBatch([
      { timestamp: '2026-05-13T12:00:00.000Z', level: 'info', component: 'C', message: 'a' },
      { timestamp: '2026-05-13T12:00:01.000Z', level: 'error', component: 'C', message: 'b' },
    ], 'extension');
    const res = handleGetLogs(new URLSearchParams('level=error'), svc);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].level).toBe('error');
  });

  it('returns nextCursor when more rows exist', () => {
    const { svc } = makeService();
    for (let i = 0; i < 5; i++) {
      svc.insertBatch([{
        timestamp: `2026-05-13T12:00:0${i}.000Z`,
        level: 'info',
        component: 'C',
        message: `m${i}`,
      }], 'extension');
    }
    const res = handleGetLogs(new URLSearchParams('limit=2'), svc);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.logs).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();
  });

  it('supports LIKE search via q', () => {
    const { svc } = makeService();
    svc.insertBatch([
      { timestamp: '2026-05-13T12:00:00.000Z', level: 'info', component: 'C', message: 'memory pause' },
      { timestamp: '2026-05-13T12:00:01.000Z', level: 'info', component: 'C', message: 'commit done' },
    ], 'extension');
    const res = handleGetLogs(new URLSearchParams('q=memory'), svc);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].message).toContain('memory');
  });

  it('returns 400 for invalid level', () => {
    const { svc } = makeService();
    const res = handleGetLogs(new URLSearchParams('level=trace'), svc);
    expect(res.status).toBe(400);
  });
});
