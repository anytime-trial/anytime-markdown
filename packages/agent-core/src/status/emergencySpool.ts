// Phase 5 S2 (Emergency Protocol): 検知イベントの JSONL spool。
//
// フック（短命プロセス）は trail.db を直接開かず、`<git-common-dir>/anytime/emergency-spool.jsonl`
// へ追記だけ行う。trail 拡張が定期 drain して S1 既存の `/api/trail/emergency-log` 経路で
// emergency_log へ記録する（要件書 §12.4）。rename 先行 drain は gitActivitySpool と同方式
// （read → rm の間に追記された行を失わない）。
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const SPOOL_FILENAME = 'emergency-spool.jsonl';

/** 滞留上限。拡張が長期間 drain しないときの無制限肥大を防ぐ。 */
export const EMERGENCY_SPOOL_MAX = 200;

export interface EmergencySpoolEvent {
  /** UTC ISO 8601 */
  occurredAt: string;
  event: 'anomaly_detected' | 'kill_switch_on';
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
    (c['event'] === 'anomaly_detected' || c['event'] === 'kill_switch_on') &&
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
  onError: (message: string) => void = (m) => console.warn(`[anytime-emergency-spool] ${m}`),
): void {
  const path = emergencySpoolPath(airspaceDir);
  try {
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
      if (lines.length >= EMERGENCY_SPOOL_MAX) {
        onError(`spool が上限 ${EMERGENCY_SPOOL_MAX} 件に達したため追記を破棄した: ${ev.event} ${ev.reason}`);
        return;
      }
    }
    appendFileSync(path, `${JSON.stringify(ev)}\n`, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    onError(`spool への追記に失敗した (${reason}): ${path}`);
  }
}

/**
 * spool を読み出して削除する。**読む前に rename する**（gitActivitySpool と同じ理由:
 * read → rm の間の追記を失わない。rename は同一ディレクトリ内で原子的）。
 * 壊れた行・型不一致の行は捨てるが `onError` へ渡して黙って消さない。
 */
export function drainEmergencySpool(
  path: string,
  onError: (message: string) => void = () => {},
): EmergencySpoolEvent[] {
  if (!existsSync(path)) return [];

  const draining = `${path}.draining-${randomUUID()}`;
  try {
    renameSync(path, draining);
  } catch (err) {
    // 他の drain が先に rename した等。取りこぼしではないので次回に回す。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`spool の rename に失敗した (${reason}): ${path}`);
    return [];
  }

  const rows: EmergencySpoolEvent[] = [];
  try {
    for (const line of readFileSync(draining, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isSpoolEvent(parsed)) {
          rows.push(parsed);
        } else {
          onError(`spool の行を破棄した (型不一致): ${trimmed.slice(0, 200)}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        onError(`spool の行を破棄した (${reason}): ${trimmed.slice(0, 200)}`);
      }
    }
  } finally {
    rmSync(draining, { force: true });
  }

  return rows;
}
