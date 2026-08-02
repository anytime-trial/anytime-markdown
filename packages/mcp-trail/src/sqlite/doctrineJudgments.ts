import type { Database } from 'better-sqlite3';
import {
  CREATE_DOCTRINE_JUDGMENTS,
  CREATE_DOCTRINE_JUDGMENT_INDEXES,
} from '@anytime-markdown/trail-core';
import type { ResolvedCitation } from '../doctrine/resolveCitations';

export type AgentJudgment = 'approve' | 'reject' | 'escalate';
export type Coverage = 'covered' | 'silent' | 'conflict' | 'odd_out';
export type HumanDecision = 'approve' | 'reject' | 'modified';

export interface DoctrineJudgmentInput {
  readonly sessionId: string;
  readonly subject: string;
  readonly judgment: AgentJudgment;
  readonly coverage: Coverage;
  readonly citations: ReadonlyArray<ResolvedCitation>;
  readonly judgedAt?: string;
}

export interface DoctrineJudgmentRecordResult {
  readonly id: number;
  readonly citationCount: number;
  readonly resolvedCount: number;
}

export interface HumanDecisionResult {
  /** escalate 判断は一致率の分母外のため null */
  readonly agreement: boolean | null;
  readonly agentJudgment: AgentJudgment;
}

export interface DoctrineAgreementMetrics {
  readonly total: number;
  readonly decided: number;
  readonly pending: number;
  /** covered かつ人の判断記録済み かつ agent != escalate を分母とする一致率 */
  readonly agreementRate: number | null;
  /** escalate または coverage != covered の割合（分母 = total） */
  readonly escalationRate: number | null;
  /** 解決検査を通過した引用の割合 */
  readonly citationResolutionRate: number | null;
}

/**
 * テーブルは拡張 (TrailDatabase) 側でも作成されるが、拡張の再ビルド・再配布より
 * 先に本ツールが動けるよう、書込前に冪等作成する (DDL は trail-core が単一の正)。
 */
export function ensureDoctrineJudgmentsTable(db: Database): void {
  db.exec(CREATE_DOCTRINE_JUDGMENTS);
  for (const idx of CREATE_DOCTRINE_JUDGMENT_INDEXES) {
    db.exec(idx);
  }
}

export function recordDoctrineJudgmentDirect(
  db: Database,
  input: DoctrineJudgmentInput,
): DoctrineJudgmentRecordResult {
  if (input.coverage === 'covered' && input.citations.length === 0) {
    // DCT-9: covered は「ドクトリンが判断根拠を与える」状態であり、根拠引用なしの
    // covered を許すと一致率だけが増え引用解決率を測れないレコードになる
    throw new Error("coverage='covered' requires at least one citation (DCT-9)");
  }
  ensureDoctrineJudgmentsTable(db);
  const now = new Date().toISOString();
  const judgedAt = input.judgedAt ?? now;
  const citationCount = input.citations.length;
  const resolvedCount = input.citations.filter((c) => c.resolved).length;
  // 同一 (session, subject) の再記録は最新判断で上書きし、既存の人の判断は無効化する
  // (判断が変わった後の突合は成立しないため)。
  db.prepare(
    `INSERT INTO doctrine_judgments (
       session_id, subject, agent_judgment, coverage, citations_json,
       citation_count, resolved_count, judged_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, subject) DO UPDATE SET
       agent_judgment = excluded.agent_judgment,
       coverage = excluded.coverage,
       citations_json = excluded.citations_json,
       citation_count = excluded.citation_count,
       resolved_count = excluded.resolved_count,
       judged_at = excluded.judged_at,
       human_decision = NULL,
       decided_at = NULL,
       updated_at = excluded.updated_at`,
  ).run(
    input.sessionId,
    input.subject,
    input.judgment,
    input.coverage,
    JSON.stringify(input.citations),
    citationCount,
    resolvedCount,
    judgedAt,
    now,
    now,
  );
  const row = db
    .prepare(`SELECT id FROM doctrine_judgments WHERE session_id = ? AND subject = ?`)
    .get(input.sessionId, input.subject) as { id: number };
  return { id: row.id, citationCount, resolvedCount };
}

export function recordHumanDecisionDirect(
  db: Database,
  args: {
    readonly id?: number;
    readonly sessionId?: string;
    readonly subject?: string;
    readonly decision: HumanDecision;
    readonly decidedAt?: string;
  },
): HumanDecisionResult {
  ensureDoctrineJudgmentsTable(db);
  let row: { id: number; agent_judgment: AgentJudgment } | undefined;
  let keyLabel: string;
  if (args.id !== undefined) {
    // record_doctrine_judgment が返す id が最も安定した突合キー (subject は表記揺れし得る)
    row = db
      .prepare(`SELECT id, agent_judgment FROM doctrine_judgments WHERE id = ?`)
      .get(args.id) as typeof row;
    keyLabel = `id=${args.id}`;
  } else if (args.sessionId !== undefined && args.subject !== undefined) {
    row = db
      .prepare(
        `SELECT id, agent_judgment FROM doctrine_judgments WHERE session_id = ? AND subject = ?`,
      )
      .get(args.sessionId, args.subject) as typeof row;
    keyLabel = `session_id=${args.sessionId}, subject=${args.subject}`;
  } else {
    throw new Error('recordHumanDecisionDirect requires id or (sessionId + subject)');
  }
  if (row === undefined) {
    throw new Error(`doctrine judgment not found (${keyLabel}); record_doctrine_judgment first`);
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE doctrine_judgments SET human_decision = ?, decided_at = ?, updated_at = ? WHERE id = ?`,
  ).run(args.decision, args.decidedAt ?? now, now, row.id);
  const agreement =
    row.agent_judgment === 'escalate'
      ? null
      : (row.agent_judgment === 'approve' && args.decision === 'approve') ||
        (row.agent_judgment === 'reject' && args.decision === 'reject');
  return { agreement, agentJudgment: row.agent_judgment };
}

export function getDoctrineAgreementDirect(
  db: Database,
  range: { readonly since?: string; readonly until?: string } = {},
): DoctrineAgreementMetrics {
  ensureDoctrineJudgmentsTable(db);
  // 件数規模は高々セッションあたり数件のため、範囲スキャン + JS 集計で足りる。
  const conditions: string[] = [];
  const params: string[] = [];
  if (range.since !== undefined) {
    conditions.push('judged_at >= ?');
    params.push(range.since);
  }
  if (range.until !== undefined) {
    conditions.push('judged_at <= ?');
    params.push(range.until);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT agent_judgment, coverage, human_decision, citation_count, resolved_count FROM doctrine_judgments${where}`,
    )
    .all(...params) as Array<{
    agent_judgment: AgentJudgment;
    coverage: Coverage;
    human_decision: HumanDecision | null;
    citation_count: number;
    resolved_count: number;
  }>;

  const total = rows.length;
  const decided = rows.filter((r) => r.human_decision !== null).length;
  const agreementTargets = rows.filter(
    (r) => r.coverage === 'covered' && r.human_decision !== null && r.agent_judgment !== 'escalate',
  );
  const matched = agreementTargets.filter(
    (r) =>
      (r.agent_judgment === 'approve' && r.human_decision === 'approve') ||
      (r.agent_judgment === 'reject' && r.human_decision === 'reject'),
  ).length;
  const escalations = rows.filter(
    (r) => r.agent_judgment === 'escalate' || r.coverage !== 'covered',
  ).length;
  const citationTotal = rows.reduce((sum, r) => sum + r.citation_count, 0);
  const citationResolved = rows.reduce((sum, r) => sum + r.resolved_count, 0);

  return {
    total,
    decided,
    pending: total - decided,
    agreementRate: agreementTargets.length > 0 ? matched / agreementTargets.length : null,
    escalationRate: total > 0 ? escalations / total : null,
    citationResolutionRate: citationTotal > 0 ? citationResolved / citationTotal : null,
  };
}
