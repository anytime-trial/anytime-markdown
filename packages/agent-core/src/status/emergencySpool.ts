// Phase 5 S2 (Emergency Protocol): 検知イベントの JSONL spool。
//
// フック（短命プロセス）は trail.db を直接開かず、`<git-common-dir>/anytime/emergency-spool.jsonl`
// へ追記だけ行う。trail 拡張が定期 drain して S1 既存の `/api/trail/emergency-log` 経路で
// emergency_log へ記録する（要件書 §12.4）。rename 先行 drain は gitActivitySpool と同方式
// （read → rm の間に追記された行を失わない）。
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

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
  onError: (message: string) => void = (m) => console.warn(`[anytime-emergency-spool] ${m}`),
): void {
  const path = emergencySpoolPath(airspaceDir);
  try {
    mkdirSync(airspaceDir, { recursive: true }); // 拡張未配置の環境でも spool だけは書ける
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
 * 退避ファイル 1 本を読み出し、成功時のみ削除する。
 * 読取自体の失敗（EIO・権限等）ではファイルを**残置**して null を返す（次回 drain で再試行。
 * 読めていないイベントを削除すると検知記録が消失する — cross-review 指摘の是正）。
 */
function readDrainingFile(
  file: string,
  onError: (message: string) => void,
): EmergencySpoolEvent[] | null {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    onError(`退避 spool の読取に失敗した (${reason})。残置して次回再試行する: ${file}`);
    return null;
  }
  const rows: EmergencySpoolEvent[] = [];
  for (const line of raw.split('\n')) {
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
  try {
    rmSync(file, { force: true });
  } catch (err) {
    // 削除失敗は次回 drain で同内容が再回収され得る（at-least-once。取込側の冪等 INSERT が吸収）。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`退避 spool の削除に失敗した (${reason}): ${file}`);
  }
  return rows;
}

/**
 * spool を読み出して削除する。**読む前に rename する**（gitActivitySpool と同じ理由:
 * read → rm の間の追記を失わない。rename は同一ディレクトリ内で原子的）。
 * 過去の drain が読取失敗・クラッシュで残した `.draining-*` 残骸も先に回収する。
 * 壊れた行・型不一致の行は捨てるが `onError` へ渡して黙って消さない。
 */
export function drainEmergencySpool(
  path: string,
  onError: (message: string) => void = () => {},
): EmergencySpoolEvent[] {
  const rows: EmergencySpoolEvent[] = [];

  // 1) 孤児の退避ファイル（前回 drain の読取失敗・プロセス中断の残骸）を先に回収する。
  const prefix = `${basename(path)}.draining-`;
  let entries: string[] = [];
  try {
    entries = readdirSync(dirname(path));
  } catch {
    entries = []; // ディレクトリ不在 = spool 未作成の通常運転
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const recovered = readDrainingFile(join(dirname(path), entry), onError);
    if (recovered !== null) rows.push(...recovered);
  }

  // 2) 現行 spool を rename → 読取。
  if (!existsSync(path)) return rows;
  const draining = `${path}.draining-${randomUUID()}`;
  try {
    renameSync(path, draining);
  } catch (err) {
    // 他の drain が先に rename した等。取りこぼしではないので次回に回す。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`spool の rename に失敗した (${reason}): ${path}`);
    return rows;
  }
  const current = readDrainingFile(draining, onError);
  if (current !== null) rows.push(...current);
  return rows;
}
