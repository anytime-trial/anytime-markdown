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
  it('cleanup() は system run の live ログだけを刈り、analyzer run のログは残す', () => {
    // リグレッション: 保持期限を廃止すると pipeline_run_logs が無制限に増える
    // （daemon が全ログを system run へ集約し続けるため）。一方 analyzer の run に
    // 紐づく調査用ログは「あとから失敗理由を追う」本機能の目的そのものなので
    // 消してはいけない。刈り込みは run_id = systemRunId に限定する。
    const db = makeLogDb();
    const svc = new LogService(db, broadcaster, SYSTEM_RUN_ID);

    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    // analyzer 側の run と、そこに紐づく同じだけ古い info ログ
    db.run(
      `INSERT INTO pipeline_runs
         (id, scope, wave, tier, started_at, status)
       VALUES ('analyzer-run', 'conversation_incremental', 'memory', 3, ?, 'success')`,
      [old],
    );
    db.run(
      `INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message)
       VALUES ('analyzer-run', ?, 'info', 'daemon', 'ingest', 'analyzer log')`,
      [old],
    );
    // system run 側の同じだけ古い info ログ
    db.run(
      `INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message)
       VALUES (?, ?, 'info', 'daemon', 'TrailDataServer', 'live log')`,
      [SYSTEM_RUN_ID, old],
    );

    svc.cleanup();

    const survivors = db.exec('SELECT run_id, message FROM pipeline_run_logs ORDER BY id');
    const rows = survivors[0]?.values ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[0]).toBe('analyzer-run');
    expect(rows[0]?.[1]).toBe('analyzer log');
  });
});
