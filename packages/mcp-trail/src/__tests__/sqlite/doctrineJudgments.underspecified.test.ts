// DCT-14「指示から一意に定まらない論点」の事前申告。
// 一致率が「較正の失敗」と「指示の不足」を畳んでいた問題の是正なので、検査するのは
// (1) 申告が保存されること (2) 申告ありの判断が一致率の分母から外れること
// (3) 列を持たない旧 DB が ALTER で「空の申告」へ確定すること の 3 点。

import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
  recordHumanDecisionDirect,
  getDoctrineAgreementDirect,
  listDoctrineJudgmentsBySession,
  type DoctrineJudgmentInput,
} from '../../sqlite/doctrineJudgments';
import type { ResolvedCitation } from '../../doctrine/resolveCitations';

function citation(): ResolvedCitation {
  return {
    docPath: '/docs/spec/92.doctrine/principles.ja.md',
    section: 'エラー処理',
    quote: 'ゲートは fail-closed、記録は fail-open とする。',
    resolved: true,
    reason: 'ok',
    approval: 'canon',
  };
}

function judgment(overrides: Partial<DoctrineJudgmentInput> = {}): DoctrineJudgmentInput {
  return {
    sessionId: 'session-1',
    subject: '何かの What 承認',
    judgment: 'approve',
    coverage: 'covered',
    citations: [citation()],
    ...overrides,
  };
}

/**
 * DCT-14 導入前の DDL を手書きで再現する。現行の CREATE 定数から列を引いて作ると、
 * 定数が変わったときにテストも一緒に変わってしまい「旧 DB からの移行」を検査しなくなる。
 */
const LEGACY_CREATE = `CREATE TABLE doctrine_judgments (
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
) STRICT`;

describe('doctrine judgments: underspecified_points (DCT-14)', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    ensureDoctrineJudgmentsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  function read(sessionId: string, subject: string): string {
    const row = db
      .prepare(
        `SELECT underspecified_points_json AS points FROM doctrine_judgments WHERE session_id = ? AND subject = ?`,
      )
      .get(sessionId, subject) as { points: string };
    return row.points;
  }

  it('申告を省略した記録は空配列として保存される（NULL にはならない）', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    expect(read('session-1', '何かの What 承認')).toBe('[]');
  });

  it('申告した論点はそのまま保存され、一覧にも出る', () => {
    recordDoctrineJudgmentDirect(
      db,
      judgment({ underspecifiedPoints: ['workspace 列を持たないタブの扱い'] }),
    );
    expect(read('session-1', '何かの What 承認')).toBe(
      JSON.stringify(['workspace 列を持たないタブの扱い']),
    );
    const [view] = listDoctrineJudgmentsBySession(db, 'session-1');
    expect(view?.underspecifiedPoints).toEqual(['workspace 列を持たないタブの扱い']);
    expect(view?.parseError).toBeNull();
  });

  it('同一 (session, subject) の再記録は申告も上書きする', () => {
    recordDoctrineJudgmentDirect(db, judgment({ underspecifiedPoints: ['最初の論点'] }));
    recordDoctrineJudgmentDirect(db, judgment());
    expect(read('session-1', '何かの What 承認')).toBe('[]');
  });

  describe('一致率の分母', () => {
    function decided(sessionId: string, points: string[], decision: 'approve' | 'modified'): void {
      recordDoctrineJudgmentDirect(
        db,
        judgment({ sessionId, subject: `${sessionId} の承認`, underspecifiedPoints: points }),
      );
      recordHumanDecisionDirect(db, { sessionId, subject: `${sessionId} の承認`, decision });
    }

    it('申告ありの不一致は分母に入らない（指示の不足を較正の失敗として数えない）', () => {
      decided('s1', [], 'approve');
      decided('s2', ['指示に無い設計の分岐'], 'modified');

      const metrics = getDoctrineAgreementDirect(db);
      // 分母は申告が空の 1 件のみ。s2 を含めると 1/2 = 0.5 に落ちる
      expect(metrics.agreementRate).toBe(1);
      expect(metrics.underspecified).toBe(1);
      expect(metrics.instructionGapRate).toBe(0.5);
    });

    it('申告が空の不一致は従来どおり分母にも分子の対象にも入る', () => {
      decided('s1', [], 'approve');
      decided('s2', [], 'modified');

      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.agreementRate).toBe(0.5);
      expect(metrics.underspecified).toBe(0);
      expect(metrics.instructionGapRate).toBe(0);
    });

    it('申告列が壊れている行は「申告あり」に倒して分母から外す（指標が実態より良く出ない）', () => {
      decided('s1', [], 'approve');
      decided('s2', [], 'modified');
      db.prepare(
        `UPDATE doctrine_judgments SET underspecified_points_json = '"not-an-array"' WHERE session_id = 's2'`,
      ).run();

      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.agreementRate).toBe(1);
      expect(metrics.underspecified).toBe(1);
    });
  });

  describe('列を持たない旧 DB からの移行', () => {
    let legacy: Database;

    beforeEach(() => {
      legacy = new BetterSqlite3(':memory:');
      legacy.exec(LEGACY_CREATE);
      legacy
        .prepare(
          `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, citations_json, citation_count, resolved_count, human_decision, judged_at, decided_at, created_at, updated_at)
           VALUES ('old-1', '旧レコード', 'approve', 'covered', '[]', 1, 1, 'modified', '2026-08-01T00:00:00.000Z', '2026-08-01T01:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
        )
        .run();
    });

    afterEach(() => {
      legacy.close();
    });

    it('ALTER で列が足され、既存行は空の申告に確定する', () => {
      ensureDoctrineJudgmentsTable(legacy);

      const columns = (
        legacy.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>
      ).map((c) => c.name);
      expect(columns).toContain('underspecified_points_json');

      const row = legacy
        .prepare(`SELECT underspecified_points_json AS points FROM doctrine_judgments`)
        .get() as { points: string };
      expect(row.points).toBe('[]');
    });

    it('既存行は空の申告として一致率の分母に残る（遡って自分に有利な再計算をしない）', () => {
      ensureDoctrineJudgmentsTable(legacy);

      // approve × modified の旧レコード 1 件だけ。分母から外れれば null になる
      const metrics = getDoctrineAgreementDirect(legacy);
      expect(metrics.agreementRate).toBe(0);
      expect(metrics.underspecified).toBe(0);
    });
  });
});
