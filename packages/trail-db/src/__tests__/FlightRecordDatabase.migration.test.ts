// migrateFromTrailDb（trail.db → memory-core.db のバックフィル + 検証 + DROP）の検証。
// 一時ディレクトリに旧配置（trail.db 内に 3 テーブル）を作り、移行の冪等性・
// 検証失敗時の非破壊（DROP しない）を確かめる。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CREATE_FLIGHT_REVIEWS,
  CREATE_INSTRUCTION_SESSIONS,
  CREATE_INSTRUCTIONS,
} from '@anytime-markdown/trail-core';

import { FlightRecordDatabase } from '../FlightRecordDatabase';
import { loadBetterSqlite3 } from '../internal/loadBetterSqlite3';

const TS = '2026-07-17T10:00:00.000Z';

interface LegacyContext {
  tempDir: string;
  trailDbPath: string;
  memoryDbPath: string;
}

function createLegacyTrailDb(): LegacyContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-migration-'));
  const trailDbPath = path.join(tempDir, 'trail.db');
  const Ctor = loadBetterSqlite3();
  const trail = new Ctor(trailDbPath);
  trail.pragma('foreign_keys = OFF');
  trail.exec(CREATE_INSTRUCTIONS);
  trail.exec(CREATE_INSTRUCTION_SESSIONS);
  trail.exec(CREATE_FLIGHT_REVIEWS);
  trail
    .prepare(
      `INSERT INTO instructions (id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id, started_at, closed_at, created_at, updated_at)
       VALUES ('ins-1', '/ws', 'ws', '旧指示', 'やって', 'sess-1', ?, NULL, ?, ?)`,
    )
    .run(TS, TS, TS);
  trail
    .prepare(
      `INSERT INTO instruction_sessions (session_id, instruction_id, sequence, declared_at) VALUES ('sess-1', 'ins-1', 1, ?)`,
    )
    .run(TS);
  trail
    .prepare(
      `INSERT INTO flight_reviews (session_id, workspace_path, started_at, ended_at, duration_seconds, created_at, updated_at)
       VALUES ('sess-1', '/ws', ?, ?, 60, ?, ?)`,
    )
    .run(TS, TS, TS, TS);
  trail.close();
  return { tempDir, trailDbPath, memoryDbPath: path.join(tempDir, 'memory-core.db') };
}

function trailTables(trailDbPath: string): string[] {
  const Ctor = loadBetterSqlite3();
  const trail = new Ctor(trailDbPath, { readonly: true });
  try {
    return trail
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('instructions', 'instruction_sessions', 'flight_reviews') ORDER BY name`,
      )
      .all()
      .map((r) => (r as { name: string }).name);
  } finally {
    trail.close();
  }
}

describe('FlightRecordDatabase.migrateFromTrailDb', () => {
  let ctx: LegacyContext;
  let db: FlightRecordDatabase;

  beforeEach(() => {
    ctx = createLegacyTrailDb();
    db = new FlightRecordDatabase(ctx.memoryDbPath, ctx.trailDbPath);
    db.init();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(ctx.tempDir, { recursive: true, force: true });
  });

  it('trail.db の旧 3 テーブルを memory-core.db へコピーし、検証後に trail.db 側を DROP する', () => {
    const copied = db.migrateFromTrailDb();
    expect(copied).toEqual({ instructions: 1, instruction_sessions: 1, flight_reviews: 1 });

    // memory 側に読める
    expect(db.listOpenInstructions()).toHaveLength(1);
    expect(db.listFlightReviews()).toHaveLength(1);
    expect(db.listInstructionSessions('ins-1')).toHaveLength(1);

    // trail 側は回収済み
    expect(trailTables(ctx.trailDbPath)).toEqual([]);
  });

  it('再実行は no-op（冪等。旧テーブルが無ければ null を返す）', () => {
    db.migrateFromTrailDb();
    expect(db.migrateFromTrailDb()).toBeNull();
    expect(db.listFlightReviews()).toHaveLength(1);
  });

  it('移行後の新規書き込みは memory-core.db 側へ入り、trail.db は再作成されない', () => {
    db.migrateFromTrailDb();
    db.upsertFlightReviewFromMachine({
      sessionId: 'sess-2',
      workspacePath: '/ws',
      startedAt: TS,
      endedAt: TS,
      durationSeconds: 10,
      toolCallCount: 1,
      toolFailureCount: 0,
      reworkCount: 0,
    });
    expect(db.listFlightReviews()).toHaveLength(2);
    expect(trailTables(ctx.trailDbPath)).toEqual([]);
  });

  it('memory 側に既に同キーの行があっても重複せず、残余行は追加コピーされる', () => {
    // 先に新配置側へ sess-1 と別内容の行を作る（旧テーブルの再コピーが上書きしないこと）
    db.upsertFlightReviewFromMachine({
      sessionId: 'sess-1',
      workspacePath: '/ws-new',
      startedAt: TS,
      endedAt: '2026-07-18T00:00:00.000Z',
      durationSeconds: 999,
      toolCallCount: 5,
      toolFailureCount: 1,
      reworkCount: 1,
    });
    db.migrateFromTrailDb();
    const reviews = db.listFlightReviews();
    expect(reviews).toHaveLength(1);
    // INSERT OR IGNORE のため既存（新配置側）の行が勝つ
    expect(reviews[0]?.workspacePath).toBe('/ws-new');
  });

  it('trail.db が無い構成では null を返す', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-migration-'));
    const standalone = new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'), path.join(tempDir, 'trail.db'));
    standalone.init();
    try {
      expect(standalone.migrateFromTrailDb()).toBeNull();
    } finally {
      standalone.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
