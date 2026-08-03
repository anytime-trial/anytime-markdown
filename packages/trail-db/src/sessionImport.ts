/**
 * セッション JSONL の取り込みのうち、DB に触れない部分。
 *
 * `TrailDatabase.importSession` から切り出した純粋関数群（振る舞いは移設前と同一）。
 * 取りこぼしは「メッセージが数件少ない」「セッションの model が空」という静かな形でしか
 * 現れないため、単体で固定できるようにここへ分けている。
 */
import { extractSkillName } from '@anytime-markdown/trail-core';

import { toUTC } from './dateUtils';
import type { RawContentBlock, RawLine } from './rawLine';

/** メッセージとして取り込まない行の type。セッションの本文ではなく Claude Code 内部の記録。 */
const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

export interface SessionImportMeta {
  sessionId: string;
  slug: string;
  version: string;
  model: string;
  entrypoint: string;
  /** 最初に現れた解釈可能なタイムスタンプ（UTC 正規化済み）。1 件も無ければ空文字。 */
  startTime: string;
  /** 最後に現れたタイムスタンプ（UTC 正規化済み）。 */
  endTime: string;
  messageCount: number;
  messagesToInsert: readonly RawLine[];
}

/** `sessions` 行の組み立てに要る分だけ。メッセージ本体は含めない。 */
export type SessionRowMeta = Omit<SessionImportMeta, 'messagesToInsert'>;

/** JSONL の本文を 1 行ずつパースする。壊れた行は捨て、残りの取り込みは続ける。 */
export function parseJsonlLines(content: string): RawLine[] {
  const parsed: RawLine[] = [];
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    try {
      parsed.push(JSON.parse(line) as RawLine);
    } catch {
      // Skip malformed lines
    }
  }
  return parsed;
}

/** 先に現れた非空の値を優先する（セッションのメタ情報は最初の 1 件を採る）。 */
function keepFirst(current: string, candidate: string | undefined): string {
  return current || candidate || '';
}

/**
 * 取り込む行を選びつつ、セッション単位のメタ情報を集める。
 *
 * メタ情報は「最初に現れた非空の値」を採る。ただし `endTime` だけは最後の値で上書きする。
 */
export function extractSessionMetaFromLines(parsed: readonly RawLine[]): SessionImportMeta {
  const messagesToInsert: RawLine[] = [];
  const meta = {
    sessionId: '',
    slug: '',
    version: '',
    model: '',
    entrypoint: '',
    startTime: '',
    endTime: '',
    messageCount: 0,
  };

  for (const raw of parsed) {
    if (!raw.type || SKIP_TYPES.has(raw.type)) continue;
    if (raw.isMeta === true) continue;

    const utc = raw.timestamp ? toUTC(raw.timestamp) : '';
    meta.sessionId = keepFirst(meta.sessionId, raw.sessionId);
    meta.slug = keepFirst(meta.slug, raw.slug);
    meta.version = keepFirst(meta.version, raw.version);
    meta.entrypoint = keepFirst(meta.entrypoint, raw.entrypoint);
    meta.model = keepFirst(meta.model, raw.message?.model);
    meta.startTime = keepFirst(meta.startTime, utc);
    if (raw.timestamp) meta.endTime = utc;

    messagesToInsert.push(raw);
    meta.messageCount++;
  }

  return { ...meta, messagesToInsert };
}


// ---------------------------------------------------------------------------
//  messages 行の組み立て（TrailDatabase.buildMessageInsertParams から移設）
// ---------------------------------------------------------------------------

function extractTextContent(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = (content as RawContentBlock[])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string);
  return texts.length > 0 ? texts.join('\n') : null;
}

function extractToolCalls(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string' || !Array.isArray(content)) return null;
  const calls = (content as RawContentBlock[])
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));
  return calls.length > 0 ? JSON.stringify(calls) : null;
}

/**
 * Extract Agent tool call description and model from tool_calls JSON.
 * Returns the first Agent call found (most messages have at most one).
 */
export function extractAgentInfo(
  toolCallsJson: string | null,
): { description: string | null; model: string | null; subagentType: string | null } {
  if (!toolCallsJson) return { description: null, model: null, subagentType: null };
  try {
    const calls = JSON.parse(toolCallsJson) as { name?: string; input?: Record<string, unknown> }[];
    const agentCall = calls.find((c) => c.name === 'Agent');
    if (!agentCall?.input) return { description: null, model: null, subagentType: null };
    return {
      description: (agentCall.input.description as string) ?? null,
      model: (agentCall.input.model as string) ?? null,
      subagentType: (agentCall.input.subagent_type as string) ?? null,
    };
  } catch {
    return { description: null, model: null, subagentType: null };
  }
}

/** ざっくりのトークン数見積り（4 文字 ≒ 1 トークン）。空なら null。 */
function estimateTokenCount(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

/** ユーザーメッセージの content から tool_result ブロックを抜き出す。無ければ `toolUseResult` へ退避。 */
function extractToolUseResult(raw: RawLine): string | null {
  if (raw.type === 'user' && Array.isArray(raw.message?.content)) {
    const toolResults = (raw.message.content as unknown[]).filter(
      (b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'tool_result',
    );
    if (toolResults.length > 0) return JSON.stringify(toolResults);
  }
  if (raw.toolUseResult == null) return null;
  return typeof raw.toolUseResult === 'string' ? raw.toolUseResult : JSON.stringify(raw.toolUseResult);
}

/** システムコマンド相当の行（`/clear` / `/compact`）を subtype から判別する。 */
function resolveSystemCommand(subtype: string | undefined): string | null {
  if (subtype === 'compact_boundary') return '/compact';
  if (subtype === 'local_command') return '/clear';
  return null;
}

/** `messages` の INSERT へ渡すパラメータ列（列順は INSERT_MESSAGE と 1 対 1）。 */
export function buildMessageInsertParams(
  raw: RawLine,
  session: { sessionId: string; isSubagent: boolean; fileSubagentType: string | null },
): unknown[] {
  const textContent = raw.type === 'assistant'
    ? extractTextContent(raw.message?.content) : null;
  const userMessageContent = typeof raw.message?.content === 'string' ? raw.message.content : null;
  const userContent = raw.type === 'user' ? userMessageContent : null;
  const toolCalls = raw.type === 'assistant' ? extractToolCalls(raw.message?.content) : null;
  const toolUseResult = extractToolUseResult(raw);
  const agentInfo = extractAgentInfo(toolCalls);
  // 主セッションでは Agent tool_use を持つ親メッセージのみ subagent_type を持つ（呼び出し意図記録）。
  // サブエージェント JSONL では全メッセージが meta.json 由来の subagent_type を持つ。
  const subagentType = session.isSubagent ? session.fileSubagentType : agentInfo.subagentType;

  return [
    raw.uuid ?? '', session.sessionId, raw.parentUuid ?? null,
    raw.type ?? '', raw.subtype ?? null,
    textContent, userContent, toolCalls, toolUseResult,
    raw.message?.model ?? null, raw.requestId ?? null, raw.message?.stop_reason ?? null,
    raw.message?.usage?.input_tokens ?? 0, raw.message?.usage?.output_tokens ?? 0,
    raw.message?.usage?.cache_read_input_tokens ?? 0, raw.message?.usage?.cache_creation_input_tokens ?? 0,
    raw.message?.usage?.service_tier ?? null, raw.message?.usage?.speed ?? null,
    toUTC(raw.timestamp ?? ''), raw.isSidechain ? 1 : 0, raw.isMeta ? 1 : 0,
    raw.cwd ?? null, raw.gitBranch ?? null,
    raw.durationMs ?? null, estimateTokenCount(toolUseResult), agentInfo.description, agentInfo.model,
    raw.permissionMode ?? null, extractSkillName(toolCalls), raw.agentId ?? null,
    raw.sourceToolAssistantUUID ?? null, raw.sourceToolUseID ?? null,
    resolveSystemCommand(raw.subtype), subagentType,
  ];
}
