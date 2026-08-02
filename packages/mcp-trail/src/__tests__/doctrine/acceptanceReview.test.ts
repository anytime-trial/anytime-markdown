import { buildAcceptanceReview } from '../../doctrine/acceptanceReview';
import type { GitDiffSummary } from '../../doctrine/gitDiffSummary';
import type { DoctrineJudgmentView } from '../../sqlite/doctrineJudgments';
import type { CitationApproval, ResolvedCitation } from '../../doctrine/resolveCitations';

function citation(overrides: Partial<ResolvedCitation> = {}): ResolvedCitation {
  return {
    docPath: '/docs/spec/92.doctrine/conventions.ja.md',
    section: 'ゲート・状態機構は fail-open を既定とする',
    quote: '補助機構の例外・読取失敗は処理を止めず fail-open で継続する。',
    resolved: true,
    reason: 'ok',
    approval: 'canon' as CitationApproval,
    ...overrides,
  };
}

function judgmentView(overrides: Partial<DoctrineJudgmentView> = {}): DoctrineJudgmentView {
  return {
    id: 1,
    sessionId: 'session-1',
    subject: '機能仕様書の What 承認',
    agentJudgment: 'approve',
    coverage: 'covered',
    citations: [citation()],
    gateVerdict: 'delegable',
    gateReasons: [],
    humanDecision: 'approve',
    judgedAt: '2026-08-02T01:00:00.000Z',
    decidedAt: '2026-08-02T01:05:00.000Z',
    parseError: null,
    ...overrides,
  };
}

function diffSummary(overrides: Partial<GitDiffSummary> = {}): GitDiffSummary {
  return {
    available: true,
    baseRef: 'develop',
    headRef: 'HEAD',
    commits: [{ sha: 'abc1234', subject: 'feat: 受け入れ確認を追加' }],
    files: [{ path: 'packages/mcp-trail/src/x.ts', insertions: 10, deletions: 2 }],
    degradedReason: null,
    ...overrides,
  };
}

describe('buildAcceptanceReview', () => {
  it('4 要素（判断・引用・差分・エスカレーション）が 1 回の呼び出しで揃う', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [
        judgmentView(),
        judgmentView({
          id: 2,
          subject: 'ODD 外の変更',
          agentJudgment: 'escalate',
          coverage: 'odd_out',
          gateVerdict: 'escalate',
          gateReasons: ['odd_out'],
          humanDecision: null,
          decidedAt: null,
        }),
      ],
      diff: diffSummary(),
    });

    expect(review.summary.judgmentCount).toBe(2);
    expect(review.summary.escalationCount).toBe(1);
    expect(review.escalations[0]?.subject).toBe('ODD 外の変更');
    expect(review.judgments[0]?.citations[0]?.quote).toContain('fail-open');
    expect(review.diff.files).toHaveLength(1);

    expect(review.markdown).toContain('### 1. 代行した判断');
    expect(review.markdown).toContain('### 2. 接地したドクトリン条項');
    expect(review.markdown).toContain('### 3. 成果物の差分');
    expect(review.markdown).toContain('### 4. エスカレーション事項');
  });

  it('引用は逐語本文・承認状態・解決結果を伴って Markdown に現れる', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [
        judgmentView({
          citations: [
            citation({ approval: 'draft' }),
            citation({
              quote: '実在しない引用',
              resolved: false,
              reason: 'quote_not_found',
              approval: 'unknown',
            }),
          ],
        }),
      ],
      diff: diffSummary(),
    });

    expect(review.markdown).toContain('補助機構の例外・読取失敗は処理を止めず fail-open で継続する。');
    expect(review.markdown).toContain('draft');
    expect(review.markdown).toContain('quote_not_found');
    expect(review.summary.draftGroundedCount).toBe(1);
    expect(review.summary.unresolvedCitationCount).toBe(1);
  });

  it('判断 0 件でも例外にせず「代行判断なし」を明示する', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-none',
      judgments: [],
      diff: diffSummary(),
    });

    expect(review.summary.judgmentCount).toBe(0);
    expect(review.markdown).toContain('代行判断なし');
    expect(review.markdown).toContain('エスカレーションなし');
  });

  it('差分の取得に失敗したら縮退理由を Markdown 本文にも出す', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [judgmentView()],
      diff: diffSummary({
        available: false,
        commits: [],
        files: [],
        degradedReason: "fatal: bad revision 'no-such-ref'",
      }),
    });

    expect(review.judgments).toHaveLength(1);
    expect(review.markdown).toContain('差分を取得できませんでした');
    expect(review.markdown).toContain("fatal: bad revision 'no-such-ref'");
    // 差分ゼロと読ませない
    expect(review.markdown).toContain('差分がないことを意味しません');
  });

  it('注意行は draft 接地・未解決引用・未確定がすべて無ければ出ない', () => {
    const clean = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [judgmentView()],
      diff: diffSummary(),
    });
    expect(clean.markdown).not.toContain('**注意**');

    const pending = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [judgmentView({ humanDecision: null, decidedAt: null })],
      diff: diffSummary(),
    });
    expect(pending.markdown).toContain('**注意**');
    expect(pending.summary.pendingDecisionCount).toBe(1);
  });

  it('ゲート未評価は delegable として扱わず「未評価」と表示する', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [judgmentView({ gateVerdict: null, gateReasons: [] })],
      diff: diffSummary(),
    });

    expect(review.summary.ungatedCount).toBe(1);
    expect(review.markdown).toContain('未評価');
    expect(review.summary.escalationCount).toBe(0);
  });

  it('ゲートの理由コードに日本語の説明を添える', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [
        judgmentView({
          agentJudgment: 'approve',
          gateVerdict: 'escalate',
          gateReasons: ['odd_unknown', 'no_canon_citation'],
        }),
      ],
      diff: diffSummary(),
    });

    expect(review.markdown).toContain('odd_unknown');
    expect(review.markdown).toContain('対象パスの申告がなく ODD 内と判定できない');
    expect(review.markdown).toContain('承認済み条項（canon）の引用がない');
  });

  it('引用のパース失敗は当該判断を落とさず注意行に出す', () => {
    const review = buildAcceptanceReview({
      sessionId: 'session-1',
      judgments: [
        judgmentView({ citations: [], parseError: 'citations_json: expected an array, got string' }),
      ],
      diff: diffSummary(),
    });

    expect(review.judgments).toHaveLength(1);
    expect(review.summary.parseErrorCount).toBe(1);
    expect(review.markdown).toContain('**注意**');
    expect(review.markdown).toContain('読み取れなかった');
  });
});
