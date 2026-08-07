// destructiveMigrateFromTrailDb（trail.db → memory-core.db のコピー + アンチ結合検証 +
// 退避 + DROP）の検証。一時ディレクトリに旧配置（trail.db 内に 3 テーブル）を作り、
// 冪等性・manual 訂正の優先マージ・検証失敗時の非破壊（DROP しない）・退避テーブルの
// 生成を確かめる。

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

function trailTables(trailDbPath: string, like = ''): string[] {
  const Ctor = loadBetterSqlite3();
  const trail = new Ctor(trailDbPath, { readonly: true });
  try {
    return trail
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ? ORDER BY name`,
      )
      .all(`%${like}%`)
      .map((r) => (r as { name: string }).name)
      .filter((n) => n.startsWith('instructions') || n.startsWith('instruction_sessions') || n.startsWith('flight_reviews'));
  } finally {
    trail.close();
  }
}

describe('FlightRecordDatabase.destructiveMigrateFromTrailDb', () => {
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

  it('trail.db の旧 3 テーブルをコピーし、検証後に退避テーブルへ複製してから DROP する', () => {
    const result = db.destructiveMigrateFromTrailDb();
    expect(result?.status).toBe('migrated');
    expect(result?.copiedRows).toEqual({ instructions: 1, instruction_sessions: 1, flight_reviews: 1 });
    expect(result?.missingRows).toEqual({ instructions: 0, instruction_sessions: 0, flight_reviews: 0 });

    // memory 側に読める
    expect(db.listOpenInstructions()).toHaveLength(1);
    expect(db.listFlightReviews()).toHaveLength(1);
    expect(db.listInstructionSessions('ins-1')).toHaveLength(1);

    // trail 側の生テーブルは回収済み・退避テーブルだけが残る
    expect(trailTables(ctx.trailDbPath)).toEqual([
      'flight_reviews__pre_move_backup',
      'instruction_sessions__pre_move_backup',
      'instructions__pre_move_backup',
    ]);
  });

  it('再実行は no-op（冪等。旧テーブルが無ければ null を返す）', () => {
    db.destructiveMigrateFromTrailDb();
    expect(db.destructiveMigrateFromTrailDb()).toBeNull();
    expect(db.listFlightReviews()).toHaveLength(1);
  });

  it('移行後の新規書き込みは memory-core.db 側へ入り、trail.db に生テーブルは再作成されない', () => {
    db.destructiveMigrateFromTrailDb();
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
    expect(trailTables(ctx.trailDbPath).filter((n) => !n.endsWith('__pre_move_backup'))).toEqual([]);
  });

  it('同キー衝突で双方 machine の場合は memory 側（新配置）の行が残る', () => {
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
    const result = db.destructiveMigrateFromTrailDb();
    expect(result?.status).toBe('migrated');
    const reviews = db.listFlightReviews();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.workspacePath).toBe('/ws-new');
  });

  it('trail 側の manual 訂正は memory 側の機械行に勝つ（manual > self > machine を移行経路でも守る）', () => {
    // trail 側の sess-1 行を人手訂正済みにする
    const Ctor = loadBetterSqlite3();
    const trail = new Ctor(ctx.trailDbPath);
    trail
      .prepare(
        `UPDATE flight_reviews SET outcome = 'achieved', outcome_source = 'manual',
           tags = '["手動タグ"]', notes = '人手のメモ', lesson_candidates = '[{"kind":"k"}]'
         WHERE session_id = 'sess-1'`,
      )
      .run();
    trail.close();
    // memory 側には移設後の Stop フック再送に相当する機械行が先に在る
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

    const result = db.destructiveMigrateFromTrailDb();
    expect(result?.status).toBe('migrated');
    const review = db.listFlightReviews()[0];
    expect(review?.outcome).toBe('achieved');
    expect(review?.outcomeSource).toBe('manual');
    expect(review?.tags).toBe('["手動タグ"]');
    expect(review?.notes).toBe('人手のメモ');
    expect(review?.lessonCandidates).toBe('[{"kind":"k"}]');
    // 機械集計列は memory 側（新しい機械値）を保持する
    expect(review?.toolCallCount).toBe(5);
  });

  it('コピーできない行が残ると DROP せず verification_failed を返す（非破壊）', () => {
    // CHECK 制約の無い自作 DDL で trail 側に「新スキーマへコピーできない行」を作る
    // （INSERT OR IGNORE は CHECK 違反を黙って捨てる — その黙殺を検証が捕まえること）
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-migration-'));
    const trailDbPath = path.join(tempDir, 'trail.db');
    const Ctor = loadBetterSqlite3();
    const trail = new Ctor(trailDbPath);
    trail.exec(`CREATE TABLE flight_reviews (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, workspace_path TEXT NOT NULL DEFAULT '',
      started_at TEXT, ended_at TEXT NOT NULL, duration_seconds INTEGER,
      outcome TEXT NOT NULL DEFAULT 'unknown', outcome_source TEXT NOT NULL DEFAULT 'machine',
      tool_call_count INTEGER NOT NULL DEFAULT 0, tool_failure_count INTEGER NOT NULL DEFAULT 0,
      rework_count INTEGER NOT NULL DEFAULT 0,
      unresolved_items TEXT NOT NULL DEFAULT '[]', next_concerns TEXT NOT NULL DEFAULT '[]',
      lesson_candidates TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '', rationale_audit_status TEXT NOT NULL DEFAULT 'unaudited',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    // outcome が列挙外 → 新スキーマの CHECK に弾かれ、INSERT OR IGNORE が黙って捨てる
    trail
      .prepare(
        `INSERT INTO flight_reviews (session_id, ended_at, outcome, created_at, updated_at)
         VALUES ('sess-bad', ?, 'bogus', ?, ?)`,
      )
      .run(TS, TS, TS);
    trail.close();

    const standalone = new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'), trailDbPath);
    standalone.init();
    try {
      const result = standalone.destructiveMigrateFromTrailDb();
      expect(result?.status).toBe('verification_failed');
      expect(result?.missingRows['flight_reviews']).toBe(1);
      // 非破壊: trail 側の生テーブルが残り、退避テーブルは作られない
      expect(trailTables(trailDbPath)).toEqual(['flight_reviews']);
    } finally {
      standalone.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('trail.db が無い構成では null を返す', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-migration-'));
    const standalone = new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'), path.join(tempDir, 'trail.db'));
    standalone.init();
    try {
      expect(standalone.destructiveMigrateFromTrailDb()).toBeNull();
    } finally {
      standalone.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
