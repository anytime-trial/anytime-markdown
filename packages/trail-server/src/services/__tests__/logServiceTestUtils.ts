import { BetterSqlite3CaravanDb, runMigrations } from '@anytime-markdown/trail-caravan-book';
import { LogService } from '../LogService';

export const SYSTEM_RUN_ID = 'system-run-for-log-service-tests';

/**
 * LogService 用の in-memory DB。**実 migration でスキーマを組む**。
 *
 * 手書き DDL でテーブルを作ると、migration 側の列追加・制約変更に追随せず、
 * 本番スキーマと乖離したままテストが緑になる。`caravan_pipeline_runs` の必須列を
 * 省いたスタブも同じ理由で使わない。
 */
export function makeLogDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.run(
    `INSERT INTO caravan_pipeline_runs (id, scope, wave, tier, started_at, status)
     VALUES (?, 'daemon_session', 'system', 0, '2026-08-05T00:00:00.000Z', 'running')`,
    [SYSTEM_RUN_ID],
  );
  return db;
}

export function makeLogService(): LogService {
  return new LogService(makeLogDb(), SYSTEM_RUN_ID);
}
