// DCT-19「未確定論点の解消経路」。検査するのは
// (1) 解消記録の fail-closed 4 条件（判断不在 / 申告外の論点 / 空回答 / 人の判断済み）
// (2) 最初の記録が勝つこと（再呼び出しは no-op で元の回答・時刻を返す）
// (3) 判断の再記録後も解消記録が判断 id に紐づいて存続すること
// (4) 集計: 全論点解消済みの判断が agreementRate の分母へ戻り、instructionGapRate は
//     従来どおり申告非空を数え、underspecifiedResolved が件数を返すこと。

import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
  recordHumanDecisionDirect,
  recordPointResolutionsDirect,
  fetchResolvedPoints,
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
    underspecifiedPoints: ['論点A', '論点B'],
    ...overrides,
  };
}

describe('doctrine judgments: point resolutions (DCT-19)', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    ensureDoctrineJudgmentsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it('申告済み論点への回答を記録し、fetchResolvedPoints が逐語文字列を返す', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    const result = recordPointResolutionsDirect(db, {
      id,
      resolutions: [
        { point: '論点A', answer: '回答A' },
        { point: '論点B', answer: '回答B' },
      ],
    });
    expect(result.judgmentId).toBe(id);
    expect(result.resolutions).toHaveLength(2);
    expect(result.resolutions.every((r) => !r.alreadyResolved)).toBe(true);
    expect(fetchResolvedPoints(db, { id }).sort()).toEqual(['論点A', '論点B']);
  });

  it('(sessionId, subject) でも記録できる', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    const result = recordPointResolutionsDirect(db, {
      sessionId: 'session-1',
      subject: '何かの What 承認',
      resolutions: [{ point: '論点A', answer: '回答A' }],
    });
    expect(fetchResolvedPoints(db, { id: result.judgmentId })).toEqual(['論点A']);
  });

  it('対象判断が存在しなければ例外（fail-closed）', () => {
    expect(() =>
      recordPointResolutionsDirect(db, { id: 999, resolutions: [{ point: 'x', answer: 'y' }] }),
    ).toThrow(/not found/);
  });

  it('申告配列に無い論点は例外（申告していない論点の解消は監査対象を持たない）', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    expect(() =>
      recordPointResolutionsDirect(db, {
        id,
        resolutions: [{ point: '申告していない論点', answer: '回答' }],
      }),
    ).toThrow(/not declared/);
  });

  it('空回答・空白のみの回答は例外（回答の無い解消は形骸化の抜け道）', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    expect(() =>
      recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '' }] }),
    ).toThrow(/empty/);
    expect(() =>
      recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '   ' }] }),
    ).toThrow(/empty/);
  });

  it('1 件でも不正があれば全件保存しない（部分保存を残さない）', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    expect(() =>
      recordPointResolutionsDirect(db, {
        id,
        resolutions: [
          { point: '論点A', answer: '回答A' },
          { point: '申告していない論点', answer: '回答' },
        ],
      }),
    ).toThrow(/not declared/);
    expect(fetchResolvedPoints(db, { id })).toEqual([]);
  });

  it('人の判断が記録済みの判断へは解消を記録できない（後付けの delegable 体裁を塞ぐ）', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    recordHumanDecisionDirect(db, { id, decision: 'approve' });
    expect(() =>
      recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '回答A' }] }),
    ).toThrow(/human decision/);
  });

  it('同一論点への再呼び出しは no-op で最初の記録を返す（回答の付け替えを塞ぐ）', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    const first = recordPointResolutionsDirect(db, {
      id,
      resolutions: [{ point: '論点A', answer: '最初の回答' }],
      resolvedAt: '2026-08-15T00:00:00.000Z',
    });
    const second = recordPointResolutionsDirect(db, {
      id,
      resolutions: [{ point: '論点A', answer: '別の回答' }],
      resolvedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(second.resolutions[0]).toEqual({
      point: '論点A',
      answer: '最初の回答',
      resolvedAt: first.resolutions[0]?.resolvedAt,
      alreadyResolved: true,
    });
  });

  it('判断の再記録（同一 session+subject）後も解消記録は存続する', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '回答A' }] });
    // 再記録は human_decision / delegated_at をリセットするが、id は保たれ解消も残る
    const rerecorded = recordDoctrineJudgmentDirect(db, judgment());
    expect(rerecorded.id).toBe(id);
    expect(fetchResolvedPoints(db, { id })).toEqual(['論点A']);
  });

  it('listDoctrineJudgmentsBySession が解消記録（論点・回答）を返す', () => {
    const { id } = recordDoctrineJudgmentDirect(db, judgment());
    recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '回答A' }] });
    const views = listDoctrineJudgmentsBySession(db, 'session-1');
    expect(views[0]?.pointResolutions).toEqual([
      expect.objectContaining({ point: '論点A', answer: '回答A' }),
    ]);
  });

  describe('集計への反映', () => {
    it('全論点解消済みの判断は agreementRate の分母へ戻る', () => {
      const { id } = recordDoctrineJudgmentDirect(db, judgment());
      recordPointResolutionsDirect(db, {
        id,
        resolutions: [
          { point: '論点A', answer: '回答A' },
          { point: '論点B', answer: '回答B' },
        ],
      });
      recordHumanDecisionDirect(db, { id, decision: 'approve' });
      const metrics = getDoctrineAgreementDirect(db);
      // 解消済みでなければ分母 0 で null になる（DCT-14 の従来動作）。1.0 は分母復帰の証拠
      expect(metrics.agreementRate).toBe(1);
      expect(metrics.underspecifiedResolved).toBe(1);
    });

    it('未解消の論点が残る判断は従来どおり分母から外れる', () => {
      const { id } = recordDoctrineJudgmentDirect(db, judgment());
      recordPointResolutionsDirect(db, { id, resolutions: [{ point: '論点A', answer: '回答A' }] });
      recordHumanDecisionDirect(db, { id, decision: 'approve' });
      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.agreementRate).toBeNull();
      expect(metrics.underspecifiedResolved).toBe(0);
    });

    it('instructionGapRate は解消後も申告非空を数える（指示が不足していた事実は変わらない）', () => {
      const { id } = recordDoctrineJudgmentDirect(db, judgment());
      recordPointResolutionsDirect(db, {
        id,
        resolutions: [
          { point: '論点A', answer: '回答A' },
          { point: '論点B', answer: '回答B' },
        ],
      });
      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.instructionGapRate).toBe(1);
      expect(metrics.underspecified).toBe(1);
    });
  });
});
