// Phase 6 S1 (Flight Review): flight_reviews 永続化のポート。
// 実装は trail-db の TrailDatabase（副作用: trail.db への書き込み）。

import type {
  FlightReview,
  FlightReviewFilter,
  FlightReviewMachineInput,
  LessonCandidate,
  SelfAssessment,
  UserFeedbackEntry,
  UserFeedbackFilter,
  UserFeedbackInput,
} from '../model/flightReview';

export interface IFlightReviewRepository {
  /**
   * 機械集計行の UPSERT（trail.db へ書き込む副作用を持つ）。
   * session_id をキーに冪等: 既存行があれば機械集計列のみ更新し、
   * outcome / outcome_source / tags / notes は変更しない。
   */
  upsertFlightReviewFromMachine(input: FlightReviewMachineInput): void;
  /**
   * 機体の自己評価を反映（trail.db へ書き込む副作用を持つ。Phase 6 S2）。
   * 優先順位 manual > self > machine: 既存行が outcome_source='manual' の場合は更新しない。
   */
  applySelfAssessmentToFlightReview(sessionId: string, assessment: SelfAssessment): void;
  /** 学習候補を保存（trail.db へ書き込む副作用を持つ。Phase 6 S2）。 */
  saveFlightReviewLessonCandidates(sessionId: string, candidates: LessonCandidate[]): void;
  listFlightReviews(filter?: FlightReviewFilter): FlightReview[];
}

/** user_feedback_entries の永続化ポート（Phase 6 S2）。実装は trail-db の TrailDatabase。 */
export interface IUserFeedbackRepository {
  /** 副作用: user_feedback_entries へ内容キー冪等 INSERT（再送を吸収）。 */
  recordUserFeedbackEntry(input: UserFeedbackInput): void;
  listUserFeedbackEntries(filter?: UserFeedbackFilter): UserFeedbackEntry[];
}
