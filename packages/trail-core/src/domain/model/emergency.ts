// Phase 5 S1 (Emergency Protocol): セーフポイントと緊急イベントのドメイン型。
// DDL は domain/schema/tables.ts の CREATE_SAFE_POINTS / CREATE_EMERGENCY_LOG が正本。

export type SafePointSource = 'stop_hook' | 'manual';

export interface SafePoint {
  id: number;
  /** UTC ISO 8601 */
  createdAt: string;
  commitHash: string;
  branch: string;
  worktree: string;
  label: string;
  source: SafePointSource;
  sessionId: string | null;
}

export type SafePointInput = Omit<SafePoint, 'id'>;

export type EmergencyEventKind =
  | 'kill_switch_on'
  | 'kill_switch_off'
  | 'rollback_executed'
  | 'anomaly_detected';

export type EmergencyActor = 'human' | 'claude' | 'agent';

export interface EmergencyEvent {
  id: number;
  /** UTC ISO 8601 */
  occurredAt: string;
  event: EmergencyEventKind;
  reason: string;
  actor: EmergencyActor;
  sessionId: string | null;
  /** 追加コンテキスト（JSON 文字列） */
  detailJson: string;
}

export type EmergencyEventInput = Omit<EmergencyEvent, 'id'>;
