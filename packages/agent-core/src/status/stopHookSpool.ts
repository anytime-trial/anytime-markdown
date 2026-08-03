// Stop フック記録（flight-review / safe-point）の JSONL spool。
//
// 旧方式は Stop フックが trail デーモンへ `curl || true` で直接 POST しており、デーモン
// 停止中（trail 拡張は onView activation のみ）の記録が痕跡なく全損した（2026-07-22〜24 /
// 07-31 で実測）。emergency spool（Phase 5 S2）と同じ at-least-once 方式へ移行する:
// フックは `<git-common-dir>/anytime/stop-hook-spool.jsonl` へ 1 行追記するだけにし、
// trail 拡張が定期 drain して kind ごとの既存 API（/api/trail/flight-reviews /
// /api/trail/safe-points）へ POST する。
//
// 書き手は bash（フック内 `printf '%s\n' >> spool`）で、本モジュールの append は
// drain 失敗時の書き戻し専用。行の形式は両者で同一（1 行 1 JSON オブジェクト）。
import { join } from 'node:path';

import { appendJsonlSpool, drainJsonlSpool } from './jsonlSpool';
import type { SpoolErrorReporter } from './jsonlSpool';

const SPOOL_FILENAME = 'stop-hook-spool.jsonl';

/**
 * 滞留上限。Stop はターン毎に発火するため emergency（200）より一桁大きい。
 * 上限到達時は追記を破棄してログへ残す（古い行を優先保全）。
 */
export const STOP_HOOK_SPOOL_MAX = 2000;

export interface FlightReviewSpoolPayload {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  /** UTC ISO 8601 */
  endedAt: string;
}

export interface SafePointSpoolPayload {
  /** UTC ISO 8601 */
  createdAt: string;
  commitHash: string;
  branch: string;
  worktree: string;
  label: string;
  source: 'stop_hook';
  sessionId: string | null;
}

export type StopHookSpoolEvent =
  | { kind: 'flight_review'; payload: FlightReviewSpoolPayload }
  | { kind: 'safe_point'; payload: SafePointSpoolPayload };

export function stopHookSpoolPath(airspaceDir: string): string {
  return join(airspaceDir, SPOOL_FILENAME);
}

function isFlightReviewPayload(value: unknown): value is FlightReviewSpoolPayload {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c['sessionId'] === 'string' &&
    c['sessionId'] !== '' &&
    typeof c['transcriptPath'] === 'string' &&
    typeof c['cwd'] === 'string' &&
    typeof c['endedAt'] === 'string' &&
    c['endedAt'] !== ''
  );
}

function isSafePointPayload(value: unknown): value is SafePointSpoolPayload {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c['createdAt'] === 'string' &&
    c['createdAt'] !== '' &&
    typeof c['commitHash'] === 'string' &&
    c['commitHash'] !== '' &&
    typeof c['branch'] === 'string' &&
    typeof c['worktree'] === 'string' &&
    typeof c['label'] === 'string' &&
    c['source'] === 'stop_hook' &&
    (typeof c['sessionId'] === 'string' || c['sessionId'] === null)
  );
}

export function isStopHookSpoolEvent(value: unknown): value is StopHookSpoolEvent {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  if (c['kind'] === 'flight_review') return isFlightReviewPayload(c['payload']);
  if (c['kind'] === 'safe_point') return isSafePointPayload(c['payload']);
  return false;
}

/**
 * 副作用: spool へ 1 行追記する（drain 失敗時の書き戻し用。通常の書き手は bash フック）。
 * 滞留が STOP_HOOK_SPOOL_MAX 以上なら追記を拒否して `onError` へ通知する。失敗は fail-open。
 */
export function appendStopHookSpool(
  airspaceDir: string,
  ev: StopHookSpoolEvent,
  onError: SpoolErrorReporter = (m) => console.warn(`[anytime-stop-hook-spool] ${m}`),
): void {
  appendJsonlSpool(stopHookSpoolPath(airspaceDir), ev, STOP_HOOK_SPOOL_MAX, onError);
}

/**
 * spool を読み出して削除する（rename 先行・孤児回収・不正行の報告は jsonlSpool の契約に従う）。
 */
export function drainStopHookSpool(
  path: string,
  onError: SpoolErrorReporter = () => {},
): StopHookSpoolEvent[] {
  return drainJsonlSpool(path, isStopHookSpoolEvent, onError);
}

/**
 * drain 済みイベントを POST 前に縮約する。
 * - flight_review: sessionId ごとに endedAt 最大の 1 件のみ残す（Stop はターン毎に発火し、
 *   サーバは sessionId で upsert するため中間ターンの再送は無駄打ちになる）。
 * - safe_point: 完全一致タプルを 1 件へ（curl タイムアウト再送・二重追記の吸収。
 *   最終防衛はサーバ側 recordSafePoint の冪等 INSERT）。
 * 返却順は入力の初出順を保つ。
 */
export function consolidateStopHookSpoolEvents(
  events: StopHookSpoolEvent[],
): StopHookSpoolEvent[] {
  const latestFlightReview = new Map<string, FlightReviewSpoolPayload>();
  for (const ev of events) {
    if (ev.kind !== 'flight_review') continue;
    const prev = latestFlightReview.get(ev.payload.sessionId);
    // 孤児 .draining 回収で行順が時系列と入れ替わり得るため、配列順でなく endedAt で比較する。
    if (!prev || ev.payload.endedAt >= prev.endedAt) {
      latestFlightReview.set(ev.payload.sessionId, ev.payload);
    }
  }

  const out: StopHookSpoolEvent[] = [];
  const emittedSessions = new Set<string>();
  const seenSafePoints = new Set<string>();
  for (const ev of events) {
    if (ev.kind === 'flight_review') {
      if (emittedSessions.has(ev.payload.sessionId)) continue;
      emittedSessions.add(ev.payload.sessionId);
      const latest = latestFlightReview.get(ev.payload.sessionId);
      if (latest) out.push({ kind: 'flight_review', payload: latest });
      continue;
    }
    const key = JSON.stringify([
      ev.payload.createdAt,
      ev.payload.commitHash,
      ev.payload.branch,
      ev.payload.worktree,
      ev.payload.label,
      ev.payload.sessionId,
    ]);
    if (seenSafePoints.has(key)) continue;
    seenSafePoints.add(key);
    out.push(ev);
  }
  return out;
}
