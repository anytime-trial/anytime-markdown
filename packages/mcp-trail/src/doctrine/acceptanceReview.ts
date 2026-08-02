import type { GitDiffSummary } from './gitDiffSummary';
import type { DoctrineJudgmentView } from '../sqlite/doctrineJudgments';

/**
 * 受け入れ確認インターフェース (DCT-13)。判断記録と差分から、人が判断過程を
 * 再構築せずに合否だけを決められる提示物を組み立てる。
 *
 * 合否は自動判定しない。draft 接地・未解決引用・未確定はいずれも「提示」する
 * だけで、判定は人が行う (DCT-16: 権威は人の承認のみに由来する)。
 */

export interface AcceptanceEscalation {
  readonly id: number;
  readonly subject: string;
  readonly coverage: DoctrineJudgmentView['coverage'];
  /** エージェント自身が escalate と判断した */
  readonly byAgent: boolean;
  /** カバレッジゲートが escalate と判定した */
  readonly byGate: boolean;
  readonly gateReasons: readonly string[];
}

export interface AcceptanceReviewSummary {
  readonly judgmentCount: number;
  readonly escalationCount: number;
  /** draft（人が承認していない）条項に接地した判断の件数 */
  readonly draftGroundedCount: number;
  /** 解決検査に失敗した引用の件数 */
  readonly unresolvedCitationCount: number;
  /** 人の判断が未記録の判断の件数 */
  readonly pendingDecisionCount: number;
  /** カバレッジゲート未評価（導入前の記録）の件数 */
  readonly ungatedCount: number;
  /** 記録の読み取りに失敗した判断の件数 */
  readonly parseErrorCount: number;
  readonly changedFileCount: number;
}

export interface AcceptanceReview {
  readonly sessionId: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly summary: AcceptanceReviewSummary;
  readonly judgments: readonly DoctrineJudgmentView[];
  readonly escalations: readonly AcceptanceEscalation[];
  readonly diff: GitDiffSummary;
  readonly markdown: string;
}

export interface AcceptanceReviewInput {
  readonly sessionId: string;
  readonly judgments: readonly DoctrineJudgmentView[];
  readonly diff: GitDiffSummary;
}

/** ゲート理由コードの日本語説明。内部コードの読解を人へ要求しないため (仕様 §6) */
const GATE_REASON_LABELS: Readonly<Record<string, string>> = {
  odd_unknown: '対象パスの申告がなく ODD 内と判定できない',
  odd_out: '対象が ODD（自律運航が許容される範囲）の外にある',
  restricted_area: '対象が制限領域（CI 定義・シークレット・本番設定等）にある',
  severity_unknown: '重大度の申告がなく判定できない',
  severity_high: '高重大度の変更である',
  doctrine_conflict: '複数の条項が矛盾する判断を与える',
  doctrine_silent: '判断根拠となる条項がない',
  no_canon_citation: '承認済み条項（canon）の引用がない',
};

const COVERAGE_LABELS: Readonly<Record<DoctrineJudgmentView['coverage'], string>> = {
  covered: 'ドクトリンが判断根拠を与える',
  silent: 'ドクトリンが判断根拠を与えない',
  conflict: '複数の条項が矛盾する',
  odd_out: 'ODD の外',
};

const JUDGMENT_LABELS: Readonly<Record<DoctrineJudgmentView['agentJudgment'], string>> = {
  approve: '承認',
  reject: '却下',
  escalate: 'エスカレーション',
};

const DECISION_LABELS: Readonly<Record<NonNullable<DoctrineJudgmentView['humanDecision']>, string>> =
  {
    approve: '承認',
    reject: '却下',
    modified: '条件付き承認',
  };

function describeGateReason(code: string): string {
  const label = GATE_REASON_LABELS[code];
  return label === undefined ? code : `${code}（${label}）`;
}

function isDraftGrounded(judgment: DoctrineJudgmentView): boolean {
  return judgment.citations.some((citation) => citation.approval === 'draft');
}

function collectEscalations(
  judgments: readonly DoctrineJudgmentView[],
): readonly AcceptanceEscalation[] {
  return judgments
    .filter(
      (judgment) => judgment.agentJudgment === 'escalate' || judgment.gateVerdict === 'escalate',
    )
    .map((judgment) => ({
      id: judgment.id,
      subject: judgment.subject,
      coverage: judgment.coverage,
      byAgent: judgment.agentJudgment === 'escalate',
      byGate: judgment.gateVerdict === 'escalate',
      gateReasons: judgment.gateReasons,
    }));
}

function summarize(
  judgments: readonly DoctrineJudgmentView[],
  escalations: readonly AcceptanceEscalation[],
  diff: GitDiffSummary,
): AcceptanceReviewSummary {
  return {
    judgmentCount: judgments.length,
    escalationCount: escalations.length,
    draftGroundedCount: judgments.filter(isDraftGrounded).length,
    unresolvedCitationCount: judgments.reduce(
      (sum, judgment) => sum + judgment.citations.filter((citation) => !citation.resolved).length,
      0,
    ),
    pendingDecisionCount: judgments.filter((judgment) => judgment.humanDecision === null).length,
    ungatedCount: judgments.filter((judgment) => judgment.gateVerdict === null).length,
    parseErrorCount: judgments.filter((judgment) => judgment.parseError !== null).length,
    changedFileCount: diff.files.length,
  };
}

/**
 * 注意行は該当があるときだけ出す。常時出力される定型文は読み飛ばされるため
 * (仕様 §3.2)。ゲート未評価は判断表に出るため注意行には含めない。
 */
function renderNotice(summary: AcceptanceReviewSummary, diff: GitDiffSummary): string[] {
  const notes: string[] = [];
  if (summary.draftGroundedCount > 0) {
    notes.push(`未承認（draft）条項に接地した判断 ${summary.draftGroundedCount} 件`);
  }
  if (summary.unresolvedCitationCount > 0) {
    notes.push(`解決できなかった引用 ${summary.unresolvedCitationCount} 件`);
  }
  if (summary.pendingDecisionCount > 0) {
    notes.push(`人の判断が未記録の判断 ${summary.pendingDecisionCount} 件`);
  }
  if (summary.parseErrorCount > 0) {
    notes.push(`記録を読み取れなかった判断 ${summary.parseErrorCount} 件`);
  }
  if (!diff.available) {
    notes.push('成果物の差分を取得できていない');
  }
  return notes.length === 0 ? [] : [`**注意**: ${notes.join(' / ')}`, ''];
}

function renderJudgmentTable(judgments: readonly DoctrineJudgmentView[]): string[] {
  if (judgments.length === 0) {
    return ['代行判断なし（本セッションでドクトリン接地判断は記録されていない）。', ''];
  }
  const rows = judgments.map((judgment) => {
    const gate =
      judgment.gateVerdict === null
        ? '未評価'
        : judgment.gateVerdict === 'delegable'
          ? '代行可'
          : 'エスカレーション';
    const decision =
      judgment.humanDecision === null ? '未確定' : DECISION_LABELS[judgment.humanDecision];
    return `| ${judgment.id} | ${judgment.subject} | ${JUDGMENT_LABELS[judgment.agentJudgment]} | ${judgment.coverage} | ${gate} | ${decision} |`;
  });
  return [
    '| # | 対象 | エージェント判断 | カバレッジ | ゲート | 人の判断 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ];
}

function renderCitations(judgments: readonly DoctrineJudgmentView[]): string[] {
  if (judgments.length === 0) {
    return ['接地条項なし。', ''];
  }
  const lines: string[] = [];
  for (const judgment of judgments) {
    lines.push(`**${judgment.subject}**`, '');
    if (judgment.parseError !== null) {
      lines.push(`- 引用を読み取れなかった: ${judgment.parseError}`, '');
    }
    if (judgment.citations.length === 0) {
      if (judgment.parseError === null) {
        lines.push('- 引用なし', '');
      }
      continue;
    }
    for (const citation of judgment.citations) {
      const status = citation.resolved ? '解決済み' : `未解決（${citation.reason}）`;
      lines.push(
        `- \`${citation.docPath}\` § ${citation.section} — 承認: ${citation.approval} / ${status}`,
        `    > ${citation.quote}`,
      );
    }
    lines.push('');
  }
  return lines;
}

function renderDiff(diff: GitDiffSummary): string[] {
  if (!diff.available) {
    return [
      `差分を取得できませんでした（\`${diff.baseRef}\`...\`${diff.headRef}\`）。理由: ${diff.degradedReason ?? '不明'}`,
      '',
      '**これは差分がないことを意味しません。** 受け入れ確認では別途 `git diff --stat` を確認してください。',
      '',
    ];
  }
  const lines: string[] = [`基準 \`${diff.baseRef}\` → 対象 \`${diff.headRef}\`（3 点表記）`, ''];
  if (diff.commits.length === 0) {
    lines.push('コミットなし。', '');
  } else {
    lines.push(...diff.commits.map((commit) => `- \`${commit.sha}\` ${commit.subject}`), '');
  }
  if (diff.files.length === 0) {
    lines.push('変更ファイルなし。', '');
  } else {
    lines.push('| ファイル | 追加 | 削除 |', '| --- | --- | --- |');
    lines.push(
      ...diff.files.map(
        (file) =>
          `| \`${file.path}\` | ${file.insertions ?? '-'} | ${file.deletions ?? '-'} |`,
      ),
    );
    lines.push('');
  }
  return lines;
}

function renderEscalations(escalations: readonly AcceptanceEscalation[]): string[] {
  if (escalations.length === 0) {
    return ['エスカレーションなし。', ''];
  }
  const lines: string[] = [];
  for (const escalation of escalations) {
    lines.push(`**${escalation.subject}**`, '');
    if (escalation.byAgent) {
      lines.push(
        `- エージェント判断: エスカレーション（カバレッジ ${escalation.coverage} — ${COVERAGE_LABELS[escalation.coverage]}）`,
      );
    }
    if (escalation.byGate) {
      const reasons =
        escalation.gateReasons.length === 0
          ? '理由の記録なし'
          : escalation.gateReasons.map(describeGateReason).join(' / ');
      lines.push(`- カバレッジゲート: エスカレーション — ${reasons}`);
    }
    lines.push('');
  }
  return lines;
}

export function renderAcceptanceReviewMarkdown(
  review: Omit<AcceptanceReview, 'markdown'>,
): string {
  const { summary, diff } = review;
  const lines: string[] = [
    '## 受け入れ確認',
    '',
    `セッション \`${review.sessionId}\` / 代行判断 ${summary.judgmentCount} 件 / エスカレーション ${summary.escalationCount} 件 / 変更 ${summary.changedFileCount} ファイル`,
    '',
    ...renderNotice(summary, diff),
    '### 1. 代行した判断',
    '',
    ...renderJudgmentTable(review.judgments),
    '### 2. 接地したドクトリン条項',
    '',
    ...renderCitations(review.judgments),
    '### 3. 成果物の差分',
    '',
    ...renderDiff(diff),
    '### 4. エスカレーション事項',
    '',
    ...renderEscalations(review.escalations),
  ];
  return lines.join('\n').trimEnd();
}

export function buildAcceptanceReview(input: AcceptanceReviewInput): AcceptanceReview {
  const escalations = collectEscalations(input.judgments);
  const summary = summarize(input.judgments, escalations, input.diff);
  const base: Omit<AcceptanceReview, 'markdown'> = {
    sessionId: input.sessionId,
    baseRef: input.diff.baseRef,
    headRef: input.diff.headRef,
    summary,
    judgments: input.judgments,
    escalations,
    diff: input.diff,
  };
  return { ...base, markdown: renderAcceptanceReviewMarkdown(base) };
}
