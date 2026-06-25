// handoff/rotation.ts — サブエージェント回転 / 毎タスク compact-seed（RFC 用途 (b)/(c)）の
// 純粋ヘルパ。I/O・import 副作用を持たず、Claude / Codex / 将来の別ランタイムのいずれからも
// 使える runtime 非依存の判断ロジックのみを置く（プラン 20260625 の A8）。
// 永続化・オーケストレーションは入口側（スキル/アダプタ）の責務でここには含めない。

import { HANDOFF_VERSION } from './types';
import type { HandoffState, HandoffStructured } from './types';
import { renderHandoffInjection } from './render';

/**
 * 回転ポリシー。
 * - `continue-while-cheap`（用途 (b)）: subagent_tokens が閾値以上になったら fresh へ回転。
 * - `always-fresh`（用途 (c)）: 毎タスク必ず fresh へ回転（threshold は無視）。
 */
export type RotationPolicy = 'continue-while-cheap' | 'always-fresh';

/**
 * 回転判定の既定閾値（トークン）。サブエージェント基底 ≈37K の床に作業余地を足した初期値。
 * Claude 固有値のため `shouldRotate` の `threshold` 引数で上書き可能（A7）。
 */
export const DEFAULT_ROTATION_THRESHOLD = 120_000;

// state サイズ再上限（A5）。生成側（buildHandoff）と同値を再利用し、外部入力由来の肥大を防ぐ。
const MAX_ROTATION_FILES = 30;
const MAX_ROTATION_COMMANDS = 15;
const MAX_ROTATION_STRING_LENGTH = 2_000;

/** 有限かつ非負の数値か（NaN / Infinity / 負数 / 非数値を弾く）。 */
function isValidTokenCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * fresh subagent へ回転すべきかを判定する（A1/A7）。
 * - `always-fresh`: threshold・トークン値に関わらず常に `true`。
 * - `continue-while-cheap`: 無効トークン（null/undefined/NaN/負数/Infinity）は `false`、
 *   有効なら `subagentTokens >= (threshold ?? DEFAULT_ROTATION_THRESHOLD)`。
 */
export function shouldRotate(
  subagentTokens: number | null | undefined,
  opts: { threshold?: number; policy: RotationPolicy },
): boolean {
  if (opts.policy === 'always-fresh') return true;
  if (!isValidTokenCount(subagentTokens)) return false;
  return subagentTokens >= (opts.threshold ?? DEFAULT_ROTATION_THRESHOLD);
}

/** 直近 max 件（最新ほど現在状態に近い）に絞る。 */
function capCount<T>(items: readonly T[], max: number): T[] {
  return items.length <= max ? [...items] : items.slice(items.length - max);
}

/** 1 文字列を上限長に切り詰める（超過分は … で省略）。 */
function capString(value: string, max = MAX_ROTATION_STRING_LENGTH): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** 件数・文字列長を再上限する。`*Total` は元の全件数を保持する（A5）。 */
function boundStructured(s: HandoffStructured): HandoffStructured {
  return {
    goal: capString(s.goal),
    filesTouched: capCount(s.filesTouched, MAX_ROTATION_FILES).map((f) => capString(f)),
    filesTouchedTotal: s.filesTouchedTotal,
    commands: capCount(s.commands, MAX_ROTATION_COMMANDS).map((c) => capString(c)),
    commandsTotal: s.commandsTotal,
    lastState: capString(s.lastState),
    branch: capString(s.branch),
    lastCommit: capString(s.lastCommit),
  };
}

/**
 * 圧縮ステート＋次タスク文を fresh subagent 用の prompt に組成する。
 * state（前 subagent 由来）は untrusted データとして `renderHandoffInjection` の
 * 「参照データ」マーカー＋ defang で囲い、命令混入・fence 脱出を無害化する（A3）。
 * 巨大配列・巨大文字列は再上限する（A5）。task は呼び出し側（オーケストレータ）由来の
 * 信頼できる指示としてそのまま付す。
 */
export function buildSeedPrompt(state: HandoffState, task: string): string {
  const bounded: HandoffState = { ...state, structured: boundStructured(state.structured) };
  return `${renderHandoffInjection(bounded)}\n\n## 次タスク\n${task}`;
}

/**
 * subagent prompt 末尾に付す固定の返却契約。返却 JSON スキーマを明示する。
 * Workflow の schema 強制が無い環境（Claude/Codex 双方）で「指示＋検証」により代替する（A9）。
 */
export function buildReturnContract(): string {
  return [
    '',
    '## 返却契約（必須）',
    '作業結果を述べた後、**最後に必ず**次スキーマの fenced ```json ブロックを 1 つだけ出力せよ。',
    'JSON ブロックの後に文章を続けてはならない（最後の非空白文字は閉じフェンス ``` で終わること）:',
    '',
    '```json',
    '{',
    `  "handoffVersion": ${HANDOFF_VERSION},`,
    '  "structured": {',
    '    "goal": "全体ゴール",',
    '    "filesTouched": ["直近の変更ファイル"],',
    '    "filesTouchedTotal": 0,',
    '    "commands": ["直近の実行コマンド"],',
    '    "commandsTotal": 0,',
    '    "lastState": "どこまで進んだか",',
    '    "branch": "現在ブランチ",',
    '    "lastCommit": "直近コミット hash"',
    '  },',
    '  "narrative": null',
    '}',
    '```',
  ].join('\n');
}

/** 末尾の ```json フェンス本文を抽出する（A4 の境界仕様）。 */
function extractLastJsonFence(raw: string): { json: string } | { error: string } {
  // 末尾空白を除いた最後の非空白文字が閉じフェンスで終わること（trailing text / 未閉鎖を弾く）。
  const trimmed = raw.replace(/\s+$/, '');
  if (!trimmed.endsWith('```')) return { error: 'no closing json fence' };
  const open = trimmed.lastIndexOf('```json');
  if (open === -1) return { error: 'no json fence' };
  const start = open + '```json'.length;
  const end = trimmed.length - 3;
  if (start >= end) return { error: 'empty json fence' };
  return { json: trimmed.slice(start, end).trim() };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * subagent 返却テキストから HandoffState を復元する（A2/A4/A5）。
 * 末尾 ```json フェンス抽出 → JSON.parse → runtime 型ガード検証 → サイズ再上限。
 * throw せず `{ ok }` / `{ error }` を返す（呼び出し側が 1 リトライ判定に使う）。
 */
export function parseRunningState(raw: string): { ok: HandoffState } | { error: string } {
  const fence = extractLastJsonFence(raw);
  if ('error' in fence) return fence;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fence.json);
  } catch (e) {
    return { error: `json parse failed: ${(e as Error).message}` };
  }

  if (typeof parsed !== 'object' || parsed === null) return { error: 'not an object' };
  const obj = parsed as Record<string, unknown>;

  // version 不一致はここで弾く（将来版の混入も同様に拒否）。
  if (obj.handoffVersion !== HANDOFF_VERSION) {
    return { error: `version mismatch: ${String(obj.handoffVersion)} != ${HANDOFF_VERSION}` };
  }

  const structured = obj.structured;
  if (typeof structured !== 'object' || structured === null) return { error: 'structured missing' };
  const s = structured as Record<string, unknown>;

  if (
    typeof s.goal !== 'string' ||
    typeof s.lastState !== 'string' ||
    typeof s.branch !== 'string' ||
    typeof s.lastCommit !== 'string'
  ) {
    return { error: 'structured string fields invalid' };
  }
  if (!isStringArray(s.filesTouched)) return { error: 'filesTouched must be string[]' };
  if (!isStringArray(s.commands)) return { error: 'commands must be string[]' };
  if (!isNonNegativeInteger(s.filesTouchedTotal)) return { error: 'filesTouchedTotal invalid' };
  if (!isNonNegativeInteger(s.commandsTotal)) return { error: 'commandsTotal invalid' };
  if (obj.narrative !== null && typeof obj.narrative !== 'string') return { error: 'narrative invalid' };

  const bounded = boundStructured({
    goal: s.goal,
    filesTouched: s.filesTouched,
    filesTouchedTotal: s.filesTouchedTotal,
    commands: s.commands,
    commandsTotal: s.commandsTotal,
    lastState: s.lastState,
    branch: s.branch,
    lastCommit: s.lastCommit,
  });

  return { ok: { handoffVersion: HANDOFF_VERSION, structured: bounded, narrative: obj.narrative } };
}
