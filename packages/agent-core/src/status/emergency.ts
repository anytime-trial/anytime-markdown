// Phase 5 S1 (Emergency Protocol): Kill Switch 状態台帳。
//
// 台帳は `<git-common-dir>/anytime/emergency.json`（airspace claims と同居。全 worktree 共有）。
// 読取側（フックゲート）は台帳不在・破損・型不一致のすべてで fail-open にする。
// 誤遮断はワークスペースの全 Claude セッションを止める事故になるため、
// 「読めないときは遮断しない」を安全側と定義する（要件書 §5 非機能要求）。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GateVerdict } from './airspace';

const LEDGER_FILENAME = 'emergency.json';

export interface EmergencyState {
  active: boolean;
  reason: string;
  triggeredBy: string;
  /** UTC ISO 8601 */
  triggeredAt: string;
}

export function emergencyLedgerPath(airspaceDir: string): string {
  return join(airspaceDir, LEDGER_FILENAME);
}

/** 台帳を読む。不在・破損・必須フィールド欠落は null（fail-open）。 */
export function readEmergencyState(airspaceDir: string): EmergencyState | null {
  const ledger = emergencyLedgerPath(airspaceDir);
  let raw: string;
  try {
    raw = readFileSync(ledger, 'utf8');
  } catch {
    return null; // 不在 = Kill Switch 未発動（通常運転）
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate['active'] !== 'boolean' ||
      typeof candidate['reason'] !== 'string' ||
      typeof candidate['triggeredBy'] !== 'string' ||
      typeof candidate['triggeredAt'] !== 'string'
    ) {
      return null;
    }
    return {
      active: candidate['active'],
      reason: candidate['reason'],
      triggeredBy: candidate['triggeredBy'],
      triggeredAt: candidate['triggeredAt'],
    };
  } catch {
    return null; // 破損 JSON も fail-open
  }
}

/** 副作用: 台帳ファイルを書き込む（発動・解除は VS Code コマンド経由のみの想定）。 */
export function writeEmergencyState(airspaceDir: string, state: EmergencyState): void {
  mkdirSync(airspaceDir, { recursive: true });
  writeFileSync(emergencyLedgerPath(airspaceDir), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** 副作用: 台帳ファイルを削除する（Kill Switch 解除）。不在なら何もしない。 */
export function clearEmergencyState(airspaceDir: string): void {
  const ledger = emergencyLedgerPath(airspaceDir);
  if (!existsSync(ledger)) return;
  rmSync(ledger);
}

/**
 * Kill Switch ゲート判定。active な台帳があるときだけ deny。
 * deny reason には解除手段（VS Code コマンドと台帳パスの手動削除）を必ず含める
 * （要件書 pre-mortem「誤発動で解除もできない」対策）。
 */
export function evaluateEmergencyGate(
  state: EmergencyState | null,
  airspaceDir: string,
): GateVerdict {
  if (state === null || !state.active) return { kind: 'pass' };
  const ledger = emergencyLedgerPath(airspaceDir);
  return {
    kind: 'deny',
    reason:
      `Kill Switch 発動中のためツール実行を停止しています。理由: ${state.reason}` +
      `（発動: ${state.triggeredBy} / ${state.triggeredAt}）。` +
      `解除するには VS Code コマンド「Anytime Trail: Kill Switch 解除」を実行するか、` +
      `台帳 ${ledger} を削除してください。`,
  };
}
