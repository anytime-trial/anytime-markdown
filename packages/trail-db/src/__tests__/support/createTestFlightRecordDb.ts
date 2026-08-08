// FlightRecordDatabase のテスト用ファクトリ。
//
// mkdtempSync の一時ディレクトリに memory-core.db / trail.db を作ることで、テスト中の
// 本番 DB 上書き事故 (2026-04-20) を構造的に防ぐ（createTestDb.ts と同方針）。
// FlightRecordDatabase は memory-core.db を主接続にし trail.db を ATTACH するため、
// InMemoryTrailStorage 方式（:memory:）ではなくファイルベースの隔離にする。
//
// セッション由来テーブル（sessions / repos / session_costs / session_commits /
// commit_files / messages / verification_runs）は trail.db 側に残るため、シードは
// trailRun() で trail.db へ直接流す。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

import {
  CREATE_COMMIT_FILES,
  CREATE_MESSAGES,
  CREATE_REPOS,
  CREATE_SESSION_COMMITS,
  CREATE_SESSION_COSTS,
  CREATE_SESSIONS,
  CREATE_VERIFICATION_RUNS,
} from '@anytime-markdown/trail-core';

import { FlightRecordDatabase } from '../../FlightRecordDatabase';
import type { DbLogger } from '../../DbLogger';
import { openBetterSqlite3 } from '../../internal/loadBetterSqlite3';

export interface FlightRecordTestContext {
  readonly db: FlightRecordDatabase;
  readonly tempDir: string;
  readonly trailDbPath: string;
  readonly memoryDbPath: string;
  /** trail.db 側へ生 SQL を流す（sessions / repos / session_costs 等のシード用）。 */
  trailRun(sql: string, params?: readonly unknown[]): void;
  /** memory-core.db 側へ生 SQL を流す（flight_reviews / instructions の直接検証用）。 */
  memoryRun(sql: string, params?: readonly unknown[]): void;
  cleanup(): void;
}

/** trail.db 側に必要なセッション由来テーブルを作って開いたまま返す（シード用ハンドル）。 */
function createSeedableTrailDb(trailDbPath: string): BetterSqlite3Database {
  const trail = openBetterSqlite3(trailDbPath);
  // 本番の trail.db と同じ FK OFF（better-sqlite3 は既定 ON。repos を張らない部分シードを許す）
  trail.pragma('foreign_keys = OFF');
  for (const ddl of [
    CREATE_REPOS,
    CREATE_SESSIONS,
    CREATE_SESSION_COSTS,
    CREATE_SESSION_COMMITS,
    CREATE_COMMIT_FILES,
    CREATE_MESSAGES,
    CREATE_VERIFICATION_RUNS,
  ]) {
    trail.exec(ddl);
  }
  return trail;
}

export function createTestFlightRecordDatabase(logger?: DbLogger): FlightRecordTestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-db-'));
  const trailDbPath = path.join(tempDir, 'trail.db');
  const memoryDbPath = path.join(tempDir, 'memory-core.db');
  const trail = createSeedableTrailDb(trailDbPath);
  const db = new FlightRecordDatabase(memoryDbPath, { trailDbPath, logger });
  db.init();
  const run = (handle: BetterSqlite3Database) =>
    (sql: string, params: readonly unknown[] = []): void => {
      if (params.length === 0) {
        handle.exec(sql);
        return;
      }
      handle.prepare(sql).run(...params);
    };
  const memory = openBetterSqlite3(memoryDbPath);
  return {
    db,
    tempDir,
    trailDbPath,
    memoryDbPath,
    trailRun: run(trail),
    memoryRun: run(memory),
    cleanup(): void {
      db.close();
      trail.close();
      memory.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * init() を呼ばない未初期化インスタンス。ensureDb() の「init 前に呼ぶと throw」ガードを
 * テストする用途。パスは一時ディレクトリ配下（本番パス禁止）。
 */
export function createUninitializedFlightRecordDb(): { db: FlightRecordDatabase; cleanup(): void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-db-'));
  return {
    db: new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'), { trailDbPath: path.join(tempDir, 'trail.db') }),
    cleanup(): void {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
