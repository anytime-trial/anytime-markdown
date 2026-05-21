/**
 * Additional coverage for LogService.ts:
 *   lines 163-164: HARD_LIMIT eviction — when row count exceeds 1_000_000, oldest rows are deleted.
 *
 * We cannot insert 1M rows in a unit test, so we mock the COUNT statement's get() to return
 * a value above HARD_LIMIT and verify that the eviction DELETE is executed via db.run().
 */
import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import type { MemoryDbSqlValue as SqlValue } from '@anytime-markdown/memory-core';
import { LogService } from '../LogService';

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(CREATE_EXTENSION_LOGS);
  for (const idx of CREATE_EXTENSION_LOGS_INDEXES) db.run(idx);
  return db;
}

const broadcaster = { notifyLog: jest.fn() };

describe('LogService.cleanup — HARD_LIMIT eviction', () => {
  beforeEach(() => broadcaster.notifyLog.mockClear());

  it('deletes oldest excess rows when total count exceeds HARD_LIMIT', () => {
    const db = makeDb();
    const svc = new LogService(db, broadcaster);
    const now = new Date();

    // Insert 5 rows with recent timestamps (won't be age-evicted by cleanup).
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now.getTime() - i * 1000).toISOString();
      svc.insertBatch(
        [{ timestamp: ts, level: 'info', component: 'C', message: `row ${i}` }],
        'daemon',
      );
    }

    // Patch prepare() so the COUNT(*) statement returns HARD_LIMIT + 3.
    const HARD_LIMIT = 1_000_000;
    const originalPrepare = db.prepare.bind(db);
    let countCallIndex = 0;
    const prepareSpy = jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      const stmt = originalPrepare(sql);
      if (sql.includes('COUNT(*)')) {
        const originalGet = stmt.get.bind(stmt);
        stmt.get = () => {
          countCallIndex++;
          if (countCallIndex === 1) return { n: HARD_LIMIT + 3 };
          return originalGet();
        };
      }
      return stmt;
    });

    // Intercept db.run() to detect the eviction DELETE (by timestamp ASC).
    const evictionDeletes: string[] = [];
    const originalRun = db.run.bind(db);
    const runSpy = jest.spyOn(db, 'run').mockImplementation(
      (sql: string, params?: ReadonlyArray<SqlValue>) => {
        if (sql.includes('DELETE') && sql.includes('ORDER BY timestamp ASC')) {
          evictionDeletes.push(sql);
        }
        return originalRun(sql, params);
      },
    );

    // Use a far-future "now" so no age-based deletions fire.
    svc.cleanup(new Date(now.getTime() + 1000 * 3600 * 24 * 365));

    prepareSpy.mockRestore();
    runSpy.mockRestore();

    // The eviction DELETE should have been called exactly once.
    expect(evictionDeletes.length).toBe(1);
  });
});
