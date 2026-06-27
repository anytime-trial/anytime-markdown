// handoff/parseTranscript.ts — Claude Code transcript(.jsonl) → 構造化イベント + 決定論抽出。
// OSS recall（MIT）の parse_transcript.py を TypeScript へ移植。TextRank 要約は移植しない
// （試用でコーディング transcript に対し品質不足のため）。transcript-shape の知識はこのファイルに隔離。

import { readFileSync } from 'node:fs';
import type { TranscriptEvent } from './types';

/** ツール名 → 主要引数名。detail / files 抽出に使う。 */
const TOOL_ARG: Readonly<Record<string, string>> = {
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  Read: 'file_path',
  NotebookEdit: 'notebook_path',
  Bash: 'command',
  Grep: 'pattern',
  Glob: 'pattern',
  Task: 'description',
  WebFetch: 'url',
  WebSearch: 'query',
};
const FILE_ARGS: ReadonlySet<string> = new Set(['file_path', 'notebook_path']);
const MAX_DETAIL = 160;

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
}

/** スラッシュコマンド展開ターン（実 user プロンプトではない）か。 */
function isCommandMeta(text: string): boolean {
  return (
    text.includes('<command-name>') ||
    text.includes('<command-message>') ||
    text.includes('<local-command-stdout>')
  );
}

/** スキル/システムが注入した大きな user ターン（goal 汚染源）か。 */
function isInjectedPreamble(text: string): boolean {
  return (
    text.startsWith('Base directory for this skill:') ||
    text.startsWith('<system-reminder>') ||
    /^Caveat: The messages below were generated/.test(text)
  );
}

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((b) => b && typeof b === 'object' && b.type === 'text')
      .map((b) => b.text ?? '')
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function toolEvent(block: ContentBlock): TranscriptEvent {
  const name = block.name ?? 'tool';
  const inp: Record<string, unknown> =
    block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {};
  const arg = TOOL_ARG[name];
  let detail = '';
  if (arg && typeof inp[arg] === 'string') {
    detail = inp[arg] as string;
  } else {
    for (const v of Object.values(inp)) {
      if (typeof v === 'string' && v.trim()) {
        detail = v;
        break;
      }
    }
  }
  detail = detail.split(/\s+/).filter(Boolean).join(' ').slice(0, MAX_DETAIL);
  const files = arg && FILE_ARGS.has(arg) && typeof inp[arg] === 'string' ? [inp[arg] as string] : [];
  return { role: 'tool', text: '', tool: name, detail, files };
}

/** transcript の行配列を構造化イベントへ変換する。 */
export function parseLines(lines: readonly string[]): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // 壊れた JSON 行は無視
    }
    if (!obj || typeof obj !== 'object') continue;
    const rec = obj as { type?: string; message?: { content?: unknown } };
    const content = rec.message && typeof rec.message === 'object' ? rec.message.content : null;

    if (rec.type === 'user') {
      const text = blockText(content).trim();
      if (text && !isCommandMeta(text)) {
        events.push({ role: 'user', text, tool: '', detail: '', files: [] });
      }
    } else if (rec.type === 'assistant') {
      const text = blockText(content).trim();
      if (text) events.push({ role: 'assistant', text, tool: '', detail: '', files: [] });
      if (Array.isArray(content)) {
        for (const block of content as ContentBlock[]) {
          if (block && typeof block === 'object' && block.type === 'tool_use') {
            events.push(toolEvent(block));
          }
        }
      }
    }
  }
  return events;
}

/** transcript ファイルを読み構造化イベントへ変換する。読めなければ空配列。 */
export function parse(transcriptPath: string): TranscriptEvent[] {
  try {
    return parseLines(readFileSync(transcriptPath, 'utf-8').split('\n'));
  } catch (err) {
    console.error(`[handoff] failed to read transcript: ${transcriptPath}`, err);
    return [];
  }
}

/** 最初の実 user プロンプト（注入前文を除外）。 */
export function firstUserGoal(events: readonly TranscriptEvent[]): string {
  for (const ev of events) {
    if (ev.role === 'user' && ev.text && !isInjectedPreamble(ev.text)) {
      return ev.text.split(/\s+/).join(' ');
    }
  }
  return '';
}

/** 最後の assistant テキスト（どこまで進んだか）。 */
export function lastAssistantState(events: readonly TranscriptEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.role === 'assistant' && ev.text) return ev.text.split(/\s+/).join(' ');
  }
  return '';
}

/** 触れたファイル（出現順・重複排除）。 */
export function touchedFiles(events: readonly TranscriptEvent[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    for (const f of ev.files) {
      if (f && !seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

/** 実行した Bash コマンド（出現順・重複排除）。 */
export function commands(events: readonly TranscriptEvent[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.role === 'tool' && ev.tool === 'Bash' && ev.detail && !seen.has(ev.detail)) {
      seen.add(ev.detail);
      out.push(ev.detail);
    }
  }
  return out;
}
