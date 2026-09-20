// handoff/parseCodexTranscript.ts — Codex rollout(`~/.codex/sessions/**/rollout-*.jsonl`)の
// 純粋パーサ。既存 Claude 用 parseTranscript.ts と対になり、共通の TranscriptEvent[] へ変換する
// ことで buildHandoffState / redact / render をソース非依存に再利用する。
//
// 抽出対象は `event_msg` の `item_completed` イベントに限る。response_item（message/
// custom_tool_call 等）は Codex 内部の生イベントであり、ホストが注入した developer プリアンブル
// （skills/permissions 指示など）を含む。item_completed は Codex 自身が「1 ターン分の完了項目」
// として確定したものだけを流すため、Claude 側の isInjectedPreamble/isCommandMeta 相当の除外を
// 別途実装しなくても素の user 指示だけを拾える（実 rollout（cli_version 0.154.0）で確認済み）。
//
// 観測した item.type: UserMessage / AgentMessage / CommandExecution / FileChange / Reasoning。
// Reasoning は目的・進捗・変更ファイル・実行コマンドのいずれにも該当しないため無視する。
// 未知の item.type は fail-safe に無視する（rollout 形式は公開安定 API ではないため）。

import { readFileSync, statSync } from 'node:fs';
import { parseCodexSessionMeta } from '../codex/parseCodexRollout';
import type { TranscriptEvent } from './types';

const MAX_DETAIL = 160;
// 引継ぎ対象は 1 セッション分の rollout のみ（低頻度なユーザー操作）だが、rollout は untrusted な
// 外部ファイルであり長時間セッションで肥大化しうる。無制限 readFileSync は拡張ホストの同期フリーズ /
// OOM につながるため上限を設け、超過時は fail-safe に null を返す（レビュー指摘）。
const MAX_ROLLOUT_BYTES = 32 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** UserMessage/AgentMessage の content 配列（`{ text: string, ... }[]`）からテキストを結合する。 */
function itemText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const b = record(block);
      return b && typeof b.text === 'string' ? b.text : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function truncateDetail(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_DETAIL);
}

/** event_msg.item_completed.item を TranscriptEvent へ変換する。既知の type 以外は null。 */
function itemCompletedEvent(item: Record<string, unknown>): TranscriptEvent | null {
  switch (item.type) {
    case 'UserMessage': {
      const text = itemText(item.content);
      return text ? { role: 'user', text, tool: '', detail: '', files: [] } : null;
    }
    case 'AgentMessage': {
      const text = itemText(item.content);
      return text ? { role: 'assistant', text, tool: '', detail: '', files: [] } : null;
    }
    case 'CommandExecution': {
      // command は argv 配列（実行はしない・表示専用の結合文字列にするだけ）。
      const command = isStringArray(item.command) ? item.command.join(' ') : '';
      return command
        ? { role: 'tool', text: '', tool: 'Bash', detail: truncateDetail(command), files: [] }
        : null;
    }
    case 'FileChange': {
      const changes = record(item.changes);
      const files = changes ? Object.keys(changes) : [];
      return files.length > 0 ? { role: 'tool', text: '', tool: 'FileChange', detail: '', files } : null;
    }
    default:
      return null;
  }
}

function parseCodexEventLine(line: string): TranscriptEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null; // 部分読み・破損行は無視
  }
  const root = record(parsed);
  if (!root || root.type !== 'event_msg') return null;
  const payload = record(root.payload);
  if (!payload || payload.type !== 'item_completed') return null;
  const item = record(payload.item);
  return item ? itemCompletedEvent(item) : null;
}

/** rollout 行配列を構造化イベントへ変換する（session_meta 行を含んでいても無視される）。 */
export function parseCodexLines(lines: readonly string[]): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const ev = parseCodexEventLine(line);
    if (ev) events.push(ev);
  }
  return events;
}

export interface CodexTranscriptResult {
  readonly events: readonly TranscriptEvent[];
  /** session_meta.cwd（新規セッションの起動ディレクトリに使う）。 */
  readonly cwd: string;
}

/**
 * Codex rollout ファイルを読み、構造化イベントと cwd を抽出する。
 * 読み取り不能・先頭行が session_meta でない（型不一致・パース失敗含む）場合は null。
 */
export function parseCodexTranscript(rolloutPath: string): CodexTranscriptResult | null {
  const safePath = rolloutPath.replaceAll(/[\r\n]/g, '↵');
  let raw: string;
  try {
    const size = statSync(rolloutPath).size;
    if (size > MAX_ROLLOUT_BYTES) {
      console.error(`[handoff] Codex rollout exceeds ${MAX_ROLLOUT_BYTES}B (${size}B); refusing to read: ${safePath}`);
      return null;
    }
    raw = readFileSync(rolloutPath, 'utf8');
  } catch (err) {
    console.error('[handoff] failed to read Codex rollout: %s', safePath, err);
    return null;
  }
  const lines = raw.split('\n');
  const meta = parseCodexSessionMeta(lines[0] ?? '');
  if (meta === null) return null;
  const events = parseCodexLines(lines);
  if (events.length === 0) {
    // rollout 形式が変わると 0 件のまま「成功」を返しうる（fail-safe な無視の裏返し）。
    // 痕跡だけは残す（呼び出し側の判定は変えない）。
    console.error(`[handoff] Codex rollout produced 0 events (format drift?): ${safePath}`);
  }
  return { events, cwd: meta.cwd };
}
