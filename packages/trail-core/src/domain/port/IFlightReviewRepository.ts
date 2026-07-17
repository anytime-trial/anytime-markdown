// Phase 6 S1 (Flight Review): flight_reviews 永続化のポート。
// 実装は trail-db の TrailDatabase（副作用: trail.db への書き込み）。

import type { FlightReview, FlightReviewFilter, FlightReviewMachineInput } from '../model/flightReview';

export interface IFlightReviewRepository {
  /**
   * 機械集計行の UPSERT（trail.db へ書き込む副作用を持つ）。
   * session_id をキーに冪等: 既存行があれば機械集計列のみ更新し、
   * outcome / outcome_source / tags / notes は変更しない。
   */
  upsertFlightReviewFromMachine(input: FlightReviewMachineInput): void;
  listFlightReviews(filter?: FlightReviewFilter): FlightReview[];
}
