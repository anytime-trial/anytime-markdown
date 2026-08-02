// Phase 5 S2 (Emergency Protocol): 検知イベントの JSONL spool。
//
// フック（短命プロセス）は trail.db を直接開かず、`<git-common-dir>/anytime/emergency-spool.jsonl`
// へ追記だけ行う。trail 拡張が定期 drain して S1 既存の `/api/trail/emergency-log` 経路で
// emergency_log へ記録する（要件書 §12.4）。rename 先行 drain の機構は jsonlSpool（汎用）へ
// 抽出した（Stop フック記録の spool 化で共用するため）。本ファイルはイベント型・検証・
// パスのみを持つ。
import { join } from 'node:path';

import { appendJsonlSpool, drainJsonlSpool } from './jsonlSpool';
import type { SpoolErrorReporter } from './jsonlSpool';

const SPOOL_FILENAME = 'emergency-spool.jsonl';

/** 滞留上限。拡張が長期間 drain しないときの無制限肥大を防ぐ。 */
export const EMERGENCY_SPOOL_MAX = 200;

const SPOOL_EVENT_KINDS = [
  'anomaly_detected',
  'kill_switch_on',
  'section_lock_denied',
  'section_lock_tamper',
] as const;

export interface EmergencySpoolEvent {
  /** UTC ISO 8601 */
  occurredAt: string;
  event: (typeof SPOOL_EVENT_KINDS)[number];
  reason: string;
  actor: 'agent';
  sessionId: string | null;
  detailJson: string | null;
}

export function emergencySpoolPath(airspaceDir: string): string {
  return join(airspaceDir, SPOOL_FILENAME);
}

function isSpoolEvent(value: unknown): value is EmergencySpoolEvent {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c['occurredAt'] === 'string' &&
    SPOOL_EVENT_KINDS.includes(c['event'] as (typeof SPOOL_EVENT_KINDS)[number]) &&
    typeof c['reason'] === 'string' &&
    c['actor'] === 'agent' &&
    (typeof c['sessionId'] === 'string' || c['sessionId'] === null) &&
    (typeof c['detailJson'] === 'string' || c['detailJson'] === null)
  );
}

/**
 * 副作用: spool へ 1 行追記する。滞留が EMERGENCY_SPOOL_MAX 以上なら追記を拒否して
 * `onError` へ通知する（silent 破棄禁止。古い行を残すのは、発端イベントの方が
 * 原因調査に有用なため）。失敗はすべて fail-open。
 */
export function appendEmergencySpool(
  airspaceDir: string,
  ev: EmergencySpoolEvent,
  onError: SpoolErrorReporter = (m) => console.warn(`[anytime-emergency-spool] ${m}`),
): void {
  appendJsonlSpool(emergencySpoolPath(airspaceDir), ev, EMERGENCY_SPOOL_MAX, onError);
}

/**
 * spool を読み出して削除する（rename 先行・孤児回収・不正行の報告は jsonlSpool の契約に従う）。
 */
export function drainEmergencySpool(
  path: string,
  onError: SpoolErrorReporter = () => {},
): EmergencySpoolEvent[] {
  return drainJsonlSpool(path, isSpoolEvent, onError);
}
