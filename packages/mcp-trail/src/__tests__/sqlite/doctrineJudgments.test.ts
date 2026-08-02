import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
  recordHumanDecisionDirect,
  getDoctrineAgreementDirect,
  type DoctrineJudgmentInput,
} from '../../sqlite/doctrineJudgments';
import type { ResolvedCitation } from '../../doctrine/resolveCitations';

function resolvedCitation(resolved = true): ResolvedCitation {
  return {
    docPath: '/docs/spec/92.doctrine/principles.ja.md',
    section: 'エラー処理',
    quote: 'ゲートは fail-closed、記録は fail-open とする。',
    resolved,
    reason: resolved ? 'ok' : 'quote_not_found',
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

  it('期間指定（since/until）で集計対象を絞れる', () => {
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '過去' }), judgedAt: '2026-01-01T00:00:00.000Z' });
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '現在' }), judgedAt: '2026-08-02T00:00:00.000Z' });
    const metrics = getDoctrineAgreementDirect(db, { since: '2026-06-01T00:00:00.000Z' });
    expect(metrics.total).toBe(1);
  });
});
