// destructiveMigrateDoctrineJudgmentsFromTrailDb（activity.db → caravan-book.db の遅延移行）の検証。
// mkdtempSync の一時ディレクトリで、id 保持コピー・id 衝突の再採番自己修復・人の判断の
// 保存確認・検証失敗時の非破壊（DROP しない）・退避テーブル生成を確かめる。

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

import {
  destructiveMigrateDoctrineJudgmentsFromTrailDb,
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
} from '../../sqlite/doctrineJudgments';

const TS = '2026-08-01T00:00:00.000Z';

function judgment(sessionId: string, subject: string) {
  return {
    sessionId,
    subject,
    judgment: 'approve' as const,
    coverage: 'silent' as const,
    citations: [],
    judgedAt: TS,
  };
}

describe('destructiveMigrateDoctrineJudgmentsFromTrailDb', () => {
  let tempDir: string;
  let trailDbPath: string;
  let memory: Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctrine-migration-'));
    trailDbPath = path.join(tempDir, 'activity.db');
    memory = new BetterSqlite3(path.join(tempDir, 'caravan-book.db'));
    ensureDoctrineJudgmentsTable(memory);
  });

  afterEach(() => {
    memory.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function seedTrail(rows: Array<{ sessionId: string; subject: string; humanDecision?: string }>): void {
    const trail = new BetterSqlite3(trailDbPath);
    ensureDoctrineJudgmentsTable(trail);
    for (const r of rows) {
      recordDoctrineJudgmentDirect(trail, judgment(r.sessionId, r.subject));
      if (r.humanDecision !== undefined) {
        trail
          .prepare(`UPDATE doctrine_judgments SET human_decision = ?, decided_at = ? WHERE session_id = ? AND subject = ?`)
          .run(r.humanDecision, TS, r.sessionId, r.subject);
      }
    }
    trail.close();
  }

  function trailTableNames(): string[] {
    const trail = new BetterSqlite3(trailDbPath, { readonly: true });
    try {
      return (
        trail
          .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'doctrine_judgments%' ORDER BY name`)
          .all() as Array<{ name: string }>
      ).map((r) => r.name);
    } finally {
      trail.close();
    }
  }

  it('trail 側の判断を id 保持でコピーし、検証後に退避してから DROP する', () => {
    seedTrail([
      { sessionId: 's1', subject: 'a' },
      { sessionId: 's2', subject: 'b', humanDecision: 'approve' },
    ]);
    const result = destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath);
    expect(result?.status).toBe('migrated');
    expect(result?.copiedRows).toBe(2);

    const rows = memory.prepare(`SELECT session_id, subject, human_decision FROM doctrine_judgments ORDER BY id`).all() as Array<{
      session_id: string;
      subject: string;
      human_decision: string | null;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[1]?.human_decision).toBe('approve');
    expect(trailTableNames()).toEqual(['doctrine_judgments__pre_move_backup']);
  });

  it('再実行は no-op（旧テーブル不在は null）', () => {
    seedTrail([{ sessionId: 's1', subject: 'a' }]);
    destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath);
    expect(destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath)).toBeNull();
  });

  it('activity.db が無ければ null', () => {
    expect(destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, path.join(tempDir, 'nope.db'))).toBeNull();
  });

  it('id 衝突は (session_id, subject) 単位の再採番で自己修復する', () => {
    // memory 側に先へ新規記録が入り id=1 を占有しているケース
    recordDoctrineJudgmentDirect(memory, judgment('s-new', 'post-move'));
    seedTrail([{ sessionId: 's-old', subject: 'pre-move' }]); // trail 側も id=1
    const result = destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath);
    expect(result?.status).toBe('migrated');
    const subjects = (memory.prepare(`SELECT subject FROM doctrine_judgments ORDER BY id`).all() as Array<{ subject: string }>).map(
      (r) => r.subject,
    );
    expect(subjects).toEqual(['post-move', 'pre-move']);
  });

  it('同一キーで trail 側だけが human_decision を持つ場合は移送する', () => {
    recordDoctrineJudgmentDirect(memory, judgment('s1', 'a')); // memory 側は判断未記録
    seedTrail([{ sessionId: 's1', subject: 'a', humanDecision: 'reject' }]);
    const result = destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath);
    expect(result?.status).toBe('migrated');
    const row = memory.prepare(`SELECT human_decision FROM doctrine_judgments WHERE session_id = 's1'`).get() as {
      human_decision: string | null;
    };
    expect(row.human_decision).toBe('reject');
  });

  it('コピーできない行が残ると DROP せず verification_failed（非破壊）', () => {
    // CHECK 無しの自作 DDL で「新スキーマへコピーできない行」を作る（INSERT OR IGNORE は
    // CHECK 違反を黙って捨てる — その黙殺をアンチ結合検証が捕まえること）
    const trail = new BetterSqlite3(trailDbPath);
    trail.exec(`CREATE TABLE doctrine_judgments (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, subject TEXT NOT NULL,
      agent_judgment TEXT NOT NULL, coverage TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]', citation_count INTEGER NOT NULL DEFAULT 0,
      resolved_count INTEGER NOT NULL DEFAULT 0, human_decision TEXT, judged_at TEXT NOT NULL,
      decided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (session_id, subject))`);
    trail
      .prepare(
        `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, judged_at, created_at, updated_at)
         VALUES ('s1', 'bad', 'bogus-judgment', 'silent', ?, ?, ?)`,
      )
      .run(TS, TS, TS);
    trail.close();

    const result = destructiveMigrateDoctrineJudgmentsFromTrailDb(memory, trailDbPath);
    expect(result?.status).toBe('verification_failed');
    expect(result?.missingRows).toBe(1);
    expect(trailTableNames()).toEqual(['doctrine_judgments']);
  });
});
