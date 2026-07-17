// Phase 6 S1 (Flight Review): フライト（セッション）単位の運航後レビューのドメイン型。
// DDL は domain/schema/tables.ts の CREATE_FLIGHT_REVIEWS が正本。
// S1 は機械集計（outcome='unknown' 固定）のみ。自己評価（self）は S2、手動訂正（manual）は S3 で書き込みが始まる。

export type FlightOutcome = 'achieved' | 'partial' | 'unachieved' | 'unknown';

export type FlightOutcomeSource = 'machine' | 'self' | 'manual';

export interface FlightReview {
  id: number;
  sessionId: string;
  workspacePath: string;
  /** UTC ISO 8601。transcript が読めなかった場合は null */
  startedAt: string | null;
  /** UTC ISO 8601 */
  endedAt: string;
  durationSeconds: number | null;
  outcome: FlightOutcome;
  outcomeSource: FlightOutcomeSource;
  toolCallCount: number;
  toolFailureCount: number;
  reworkCount: number;
  /** JSON 配列文字列 */
  unresolvedItems: string;
  /** JSON 配列文字列（Phase 6 S2: 次回の懸念点） */
  nextConcerns: string;
  /** JSON 配列文字列（Phase 6 S2: 学習候補 LessonCandidate[]） */
  lessonCandidates: string;
  /** JSON 配列文字列 */
  tags: string;
  notes: string;
  /** UTC ISO 8601 */
  createdAt: string;
  /** UTC ISO 8601 */
  updatedAt: string;
}

/**
 * Stop フック（機械集計）経路の UPSERT 入力。
 * outcome / outcomeSource / tags / notes は含めない — 再送が S2 の自己評価・S3 の手動訂正を上書きしないため。
 */
export interface FlightReviewMachineInput {
  sessionId: string;
  workspacePath: string;
  startedAt: string | null;
  endedAt: string;
  durationSeconds: number | null;
  toolCallCount: number;
  toolFailureCount: number;
  reworkCount: number;
}

/** 機体の構造化自己評価（transcript の debrief ブロック由来。Phase 6 S2） */
export interface SelfAssessment {
  outcome: Exclude<FlightOutcome, 'unknown'>;
  unresolvedItems: string[];
  nextConcerns: string[];
}

/** 学習候補（採否判断は人間。Phase 6 S2） */
export interface LessonCandidate {
  kind: 'tool_failure_chain' | 'user_correction';
  summary: string;
  evidence: string;
}

/** ユーザーの事後修正指示の記録（user_feedback_entries。Phase 6 S2） */
export interface UserFeedbackEntry {
  id: number;
  sessionId: string;
  /** UTC ISO 8601 */
  occurredAt: string;
  promptExcerpt: string;
  matchedPattern: string;
  /** UTC ISO 8601 */
  createdAt: string;
}

export type UserFeedbackInput = Omit<UserFeedbackEntry, 'id' | 'createdAt'>;

export interface UserFeedbackFilter {
  sessionId?: string;
  limit?: number;
}

export interface FlightReviewFilter {
  sessionId?: string;
  /** ended_at >= since（UTC ISO 8601） */
  since?: string;
  /** ended_at <= until（UTC ISO 8601） */
  until?: string;
  /** outcome 等値（Phase 6 S3） */
  outcome?: FlightOutcome;
  /** tags 配列内の等値一致（Phase 6 S3） */
  tag?: string;
  limit?: number;
}

/**
 * 手動訂正の部分更新入力（Phase 6 S3）。
 * outcome に 'unknown' は指定できない — 手動訂正は人間の判断の記録であり、
 * 「不明に戻す」操作は提供しない（unknown は機械集計の初期値専用）。
 */
export interface FlightReviewManualPatch {
  outcome?: Exclude<FlightOutcome, 'unknown'>;
  tags?: string[];
  notes?: string;
}
