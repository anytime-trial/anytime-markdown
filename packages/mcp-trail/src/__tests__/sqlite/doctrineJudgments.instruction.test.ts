// 行動範囲検証（共用 UI 優先 3・FR-04/05）: 判断行の指示連結と、既存 DB への列追加。
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { ensureDoctrineJudgmentsTable } from '../../sqlite/doctrineJudgments';
import { findInstructionIdForSession, openInstructionDirect, continueInstructionDirect } from '../../sqlite/instructions';

describe('doctrine judgments × instruction linkage', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('列を持たない既存テーブルへ ensure が instruction_id / tool_name / action_scope を足す', () => {
    db.exec(`CREATE TABLE caravan_doctrine_judgments (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      agent_judgment TEXT NOT NULL,
      coverage TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      citation_count INTEGER NOT NULL DEFAULT 0,
      resolved_count INTEGER NOT NULL DEFAULT 0,
      human_decision TEXT,
      judged_at TEXT NOT NULL,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (session_id, subject)
    ) STRICT`);
    ensureDoctrineJudgmentsTable(db);
    const columns = new Set(
      (db.prepare('PRAGMA table_info(caravan_doctrine_judgments)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    expect(columns.has('instruction_id')).toBe(true);
    expect(columns.has('tool_name')).toBe(true);
    expect(columns.has('action_scope')).toBe(true);
    // 冪等
    expect(() => ensureDoctrineJudgmentsTable(db)).not.toThrow();
  });

  it('台帳テーブルが無ければ null（ensure を起動せず縮退する）', () => {
    expect(findInstructionIdForSession(db, 'session-x')).toBeNull();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
    expect(tables).toEqual([]);
  });

  it('宣言済みセッションは指示 ID を返し、未宣言セッションは null', () => {
    const opened = openInstructionDirect(db, {
      sessionId: 'session-origin',
      workspacePath: '/ws',
      summary: '優先 3 に着手',
      originPrompt: '優先 3 に着手して',
    });
    continueInstructionDirect(db, { sessionId: 'session-cont', instructionId: opened.instructionId });
    expect(findInstructionIdForSession(db, 'session-origin')).toBe(opened.instructionId);
    expect(findInstructionIdForSession(db, 'session-cont')).toBe(opened.instructionId);
    expect(findInstructionIdForSession(db, 'session-none')).toBeNull();
  });
});
