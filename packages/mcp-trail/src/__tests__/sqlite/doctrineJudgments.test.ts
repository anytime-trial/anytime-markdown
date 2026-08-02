import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
  recordHumanDecisionDirect,
  getDoctrineAgreementDirect,
  type DoctrineJudgmentInput,
} from '../../sqlite/doctrineJudgments';
import type { CitationApproval, ResolvedCitation } from '../../doctrine/resolveCitations';

function resolvedCitation(resolved = true, approval: CitationApproval = 'canon'): ResolvedCitation {
  return {
    docPath: '/docs/spec/92.doctrine/principles.ja.md',
    section: 'エラー処理',
    quote: 'ゲートは fail-closed、記録は fail-open とする。',
    resolved,
    reason: resolved ? 'ok' : 'quote_not_found',
    approval: resolved ? approval : 'unknown',
  };
}

function judgment(overrides: Partial<DoctrineJudgmentInput> = {}): DoctrineJudgmentInput {
  return {
    sessionId: 'session-1',
    subject: 'doctrine-judgment 機能仕様書の What 承認',
    judgment: 'approve',
    coverage: 'covered',
    citations: [resolvedCitation()],
    ...overrides,
  };
}

describe('doctrineJudgments', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    ensureDoctrineJudgmentsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it('接地判断を記録し、引用ごとの解決結果と件数が保存される', () => {
    const result = recordDoctrineJudgmentDirect(db, {
      ...judgment(),
      citations: [resolvedCitation(true), resolvedCitation(false)],
    });
    expect(result.citationCount).toBe(2);
    expect(result.resolvedCount).toBe(1);
    const row = db
      .prepare('SELECT citations_json, citation_count, resolved_count FROM doctrine_judgments')
      .get() as { citations_json: string; citation_count: number; resolved_count: number };
    expect(JSON.parse(row.citations_json)).toHaveLength(2);
    expect(row.citation_count).toBe(2);
    expect(row.resolved_count).toBe(1);
  });

  it('同一セッション・同一対象の再記録は 1 行のまま上書きし、既存の人の判断を無効化する', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    recordDoctrineJudgmentDirect(db, judgment({ judgment: 'reject' }));
    const rows = db
      .prepare('SELECT agent_judgment, human_decision FROM doctrine_judgments')
      .all() as Array<{ agent_judgment: string; human_decision: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ agent_judgment: 'reject', human_decision: null });
  });

  it('人の判断の後追い記録で一致 / 不一致が確定する', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    const matched = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    expect(matched.agreement).toBe(true);

    recordDoctrineJudgmentDirect(db, judgment({ subject: '別件の承認' }));
    const mismatched = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: '別件の承認',
      decision: 'modified',
    });
    expect(mismatched.agreement).toBe(false);
  });

  it('escalate 判断への人の判断は一致率の対象外（agreement=null）', () => {
    recordDoctrineJudgmentDirect(db, judgment({ judgment: 'escalate', coverage: 'silent' }));
    const result = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    expect(result.agreement).toBeNull();
  });

  it("coverage='covered' は根拠引用なしでは記録できない（DCT-9）", () => {
    expect(() =>
      recordDoctrineJudgmentDirect(db, { ...judgment(), citations: [] }),
    ).toThrow(/requires at least one citation/);
  });

  it("coverage='silent' 等のエスカレーション系は空引用を許容する", () => {
    const result = recordDoctrineJudgmentDirect(db, {
      ...judgment({ judgment: 'escalate', coverage: 'silent' }),
      citations: [],
    });
    expect(result.citationCount).toBe(0);
  });

  it('人の判断はレコード id でも突合できる（record が返す最安定キー）', () => {
    const recorded = recordDoctrineJudgmentDirect(db, judgment());
    const result = recordHumanDecisionDirect(db, { id: recorded.id, decision: 'approve' });
    expect(result.agreement).toBe(true);
  });

  it('id も (sessionId + subject) も無い人の判断記録はエラー', () => {
    expect(() => recordHumanDecisionDirect(db, { decision: 'approve' })).toThrow(
      /requires id or/,
    );
  });

  it('対応レコードがない人の判断記録はエラー（黙って新規作成しない）', () => {
    expect(() =>
      recordHumanDecisionDirect(db, {
        sessionId: 'no-such-session',
        subject: 'なにか',
        decision: 'approve',
      }),
    ).toThrow(/not found/);
  });

  it('集計が一致率・エスカレーション率・引用解決率・未突合件数を返す', () => {
    // covered + 一致
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'A' }));
    recordHumanDecisionDirect(db, { sessionId: 'session-1', subject: 'A', decision: 'approve' });
    // covered + 不一致
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'B' }));
    recordHumanDecisionDirect(db, { sessionId: 'session-1', subject: 'B', decision: 'reject' });
    // silent + escalate（一致率の分母外・エスカレーション）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'C', judgment: 'escalate', coverage: 'silent' }),
      citations: [resolvedCitation(false)],
    });
    // covered + 未突合
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'D' }));

    const metrics = getDoctrineAgreementDirect(db);
    expect(metrics.total).toBe(4);
    expect(metrics.decided).toBe(2);
    expect(metrics.pending).toBe(2);
    expect(metrics.agreementRate).toBe(0.5);
    expect(metrics.escalationRate).toBe(0.25);
    // 引用 4 件中 3 件解決（A/B/D が resolved、C が未解決）
    expect(metrics.citationResolutionRate).toBe(0.75);
  });

  it('canon 接地率は covered 判断のうち canon 引用を持つ割合（DCT-3）', () => {
    // covered + canon 引用
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'canon 接地' }));
    // covered + draft 引用のみ（未承認条項を根拠にした判断）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'draft 接地' }),
      citations: [resolvedCitation(true, 'draft')],
    });
    // silent（covered ではないため分母外）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'escalate', judgment: 'escalate', coverage: 'silent' }),
      citations: [],
    });

    const metrics = getDoctrineAgreementDirect(db);
    expect(metrics.canonGroundedRate).toBe(0.5);
  });

  it('明文規約（canon_by_document）の引用も canon 接地として数える', () => {
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'CLAUDE.md 接地' }),
      citations: [resolvedCitation(true, 'canon_by_document')],
    });
    expect(getDoctrineAgreementDirect(db).canonGroundedRate).toBe(1);
  });

  it('承認状態を持たない旧レコードは canon 接地なしと数える', () => {
    recordDoctrineJudgmentDirect(db, judgment({ subject: '旧記録' }));
    // 本機能より前の citations_json（approval フィールドを持たない）を再現する
    db.prepare('UPDATE doctrine_judgments SET citations_json = ?').run(
      JSON.stringify([{ docPath: '/docs/x.md', section: 'a', quote: 'b', resolved: true, reason: 'ok' }]),
    );
    expect(getDoctrineAgreementDirect(db).canonGroundedRate).toBe(0);
  });

  it('ゲート判定を保存し、代行可能率を集計する（DCT-10〜12）', () => {
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: '代行可' }),
      gate: { verdict: 'delegable', reasons: [] },
    });
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: '代行不可' }),
      gate: { verdict: 'escalate', reasons: ['severity_high'] },
    });
    const row = db
      .prepare(`SELECT gate_verdict, gate_reasons_json FROM doctrine_judgments WHERE subject = ?`)
      .get('代行不可') as { gate_verdict: string; gate_reasons_json: string };
    expect(row.gate_verdict).toBe('escalate');
    expect(JSON.parse(row.gate_reasons_json)).toEqual(['severity_high']);
    expect(getDoctrineAgreementDirect(db).delegableRate).toBe(0.5);
  });

  it('ゲート未評価のレコードは代行可能率の分母から除く', () => {
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'ゲートなし' }));
    expect(getDoctrineAgreementDirect(db).delegableRate).toBeNull();

    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'ゲートあり' }),
      gate: { verdict: 'delegable', reasons: [] },
    });
    expect(getDoctrineAgreementDirect(db).delegableRate).toBe(1);
  });

  it('gate 列を持たない旧スキーマの DB へ冪等に列追加する', () => {
    const legacy = new BetterSqlite3(':memory:');
    legacy.exec(`CREATE TABLE doctrine_judgments (
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
    )`);
    legacy
      .prepare(
        `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, judged_at, created_at, updated_at)
         VALUES ('s', '旧行', 'approve', 'covered', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      )
      .run();

    ensureDoctrineJudgmentsTable(legacy);
    ensureDoctrineJudgmentsTable(legacy);

    const columns = (
      legacy.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['gate_verdict', 'gate_reasons_json']));
    const rows = legacy.prepare(`SELECT subject, gate_verdict FROM doctrine_judgments`).all();
    expect(rows).toEqual([{ subject: '旧行', gate_verdict: null }]);
    legacy.close();
  });

  it('期間指定（since/until）で集計対象を絞れる', () => {
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '過去' }), judgedAt: '2026-01-01T00:00:00.000Z' });
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '現在' }), judgedAt: '2026-08-02T00:00:00.000Z' });
    const metrics = getDoctrineAgreementDirect(db, { since: '2026-06-01T00:00:00.000Z' });
    expect(metrics.total).toBe(1);
  });
});
