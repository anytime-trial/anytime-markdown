import { BetterSqlite3CaravanDb } from '@anytime-markdown/trail-caravan-book';
import { LogService } from '../../services/LogService';
import { makeLogDb, SYSTEM_RUN_ID } from '../../services/__tests__/logServiceTestUtils';
import { handlePostLogs } from '../logsApi';

function makeService(): { svc: LogService; db: BetterSqlite3CaravanDb } {
  const db = makeLogDb();
  return { svc: new LogService(db, SYSTEM_RUN_ID), db };
}

describe('handlePostLogs', () => {
  it('returns 204 when valid logs are posted', () => {
    const { svc, db } = makeService();
    const body = {
      logs: [{ timestamp: '2026-05-13T12:34:56.789Z', level: 'info', component: 'C', message: 'm' }],
    };
    const res = handlePostLogs(JSON.stringify(body), svc);
    expect(res.status).toBe(204);
    const result = db.exec('SELECT COUNT(*) AS n FROM caravan_pipeline_run_logs');
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
