import type {
  EmergencyEvent,
  EmergencyEventInput,
  SafePoint,
  SafePointInput,
} from '../model/emergency';

/**
 * Phase 5 S1: セーフポイント・緊急イベントの永続化ポート。
 * 実装は trail-db の TrailDatabase（safe_points / emergency_log テーブル）。
 */
export interface IEmergencyRepository {
  recordSafePoint(input: SafePointInput): void;
  /** created_at 降順。 */
  listSafePoints(limit?: number): SafePoint[];
  recordEmergencyEvent(input: EmergencyEventInput): void;
  /** occurred_at 降順。 */
  listEmergencyEvents(limit?: number): EmergencyEvent[];
}
