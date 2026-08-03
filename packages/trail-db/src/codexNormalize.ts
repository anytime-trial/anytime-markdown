/**
 * Codex の JSONL レコードを Claude Code 形式の {@link RawLine} 列へ正規化する。
 *
 * `TrailDatabase.importSession` から切り出した純粋関数群（振る舞いは移設前と同一）。
 * DB にも fs にも触れないため、単体で特性化テストを書ける。
 */
import { codexMessageUuid, extractCodexSessionId } from './codexMessageUuid';
import type { RawContentBlock, RawLine } from './rawLine';

export function extractCodexText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const text = (block as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim()) texts.push(text);
  }
  return texts.length > 0 ? texts.join('\n') : null;
}

export function normalizeCodexTokenUsage(last: Record<string, unknown>): {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  const totalInputTokens = Number(last.input_tokens ?? 0);
  const cachedInputTokens = Number(last.cached_input_tokens ?? 0);
  return {
    input_tokens: Math.max(0, totalInputTokens - cachedInputTokens),
    output_tokens: Number(last.output_tokens ?? 0),
    cache_read_input_tokens: cachedInputTokens,
    cache_creation_input_tokens: 0,
  };
}

export function applyCodexTokenCountToNormalized(
  payload: Record<string, unknown>,
  normalized: RawLine[],
): void {
  if (!payload.info || typeof payload.info !== 'object') return;
  const info = payload.info as Record<string, unknown>;
  const last = info.last_token_usage as Record<string, unknown> | undefined;
  if (!last || normalized.length === 0) return;
  for (let i = normalized.length - 1; i >= 0; i--) {
    const candidate = normalized[i];
    if (candidate.type !== 'assistant') continue;
    candidate.message = {
      ...(candidate.message),
      usage: normalizeCodexTokenUsage(last),
    };
    break;
  }
}

export function normalizeCodexEventMsg(
  payload: Record<string, unknown>,
  normalized: RawLine[],
  seq: number,
  sessionId: string,
  timestamp: string,
): { lines: RawLine[]; newSeq: number } {
  if (payload.type === 'task_started') return { lines: [], newSeq: seq };
  if (payload.type === 'token_count') {
    applyCodexTokenCountToNormalized(payload, normalized);
    return { lines: [], newSeq: seq };
  }
  if (payload.type === 'agent_message' && typeof payload.message === 'string') {
    return {
      lines: [{
        uuid: codexMessageUuid(sessionId, seq),
        sessionId,
        type: 'assistant',
        timestamp,
        message: { content: payload.message },
      }],
      newSeq: seq + 1,
    };
  }
  return { lines: [], newSeq: seq };
}

/** `response_item` の `message` を 1 行へ変換する。role が想定外なら null（＝行を作らない）。 */
function buildCodexMessageLine(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: string,
  seq: number,
): RawLine | null {
  const role = typeof payload.role === 'string' ? payload.role : '';
  if (role !== 'user' && role !== 'assistant' && role !== 'developer' && role !== 'system') {
    return null;
  }
  const text = extractCodexText(payload.content);
  const normalizedTypeInner: 'assistant' | 'system' = role === 'assistant' ? 'assistant' : 'system';
  const normalizedType: 'user' | 'assistant' | 'system' = role === 'user' ? 'user' : normalizedTypeInner;
  return {
    uuid: codexMessageUuid(sessionId, seq),
    sessionId,
    type: normalizedType,
    subtype: role,
    timestamp,
    message: { content: text ?? '' },
  };
}

/** `function_call` / `custom_tool_call` の引数を解釈する。JSON として壊れていれば `{ raw }` へ退避する。 */
function parseCodexToolInput(rawInput: unknown): Record<string, unknown> {
  if (typeof rawInput === 'string' && rawInput.trim()) {
    try {
      return JSON.parse(rawInput) as Record<string, unknown>;
    } catch {
      return { raw: rawInput };
    }
  }
  if (rawInput && typeof rawInput === 'object') return rawInput as Record<string, unknown>;
  return {};
}

/** `function_call` / `custom_tool_call` を tool_use ブロック 1 個の assistant 行へ変換する。 */
function buildCodexToolUseLine(
  payload: Record<string, unknown>,
  payloadType: string,
  sessionId: string,
  timestamp: string,
  seq: number,
): RawLine {
  const id = typeof payload.call_id === 'string' ? payload.call_id : `codex-call-${seq}`;
  const name = typeof payload.name === 'string' ? payload.name : 'tool';
  const rawInput = payloadType === 'function_call' ? payload.arguments : payload.input;
  return {
    uuid: codexMessageUuid(sessionId, seq),
    sessionId,
    type: 'assistant',
    timestamp,
    message: { content: [{ type: 'tool_use', id, name, input: parseCodexToolInput(rawInput) }] },
  };
}

/** `function_call_output` / `custom_tool_call_output` を tool_result ブロック 1 個の user 行へ変換する。 */
function buildCodexToolResultLine(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: string,
  seq: number,
): RawLine {
  const id = typeof payload.call_id === 'string' ? payload.call_id : '';
  const output = typeof payload.output === 'string'
    ? payload.output
    : JSON.stringify(payload.output ?? '');
  return {
    uuid: codexMessageUuid(sessionId, seq),
    sessionId,
    type: 'user',
    timestamp,
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: id,
        content: output,
        is_error: false,
      }] as unknown as readonly RawContentBlock[],
    },
  };
}

export function normalizeCodexResponseItem(
  payload: Record<string, unknown>,
  payloadType: string,
  sessionId: string,
  timestamp: string,
  seq: number,
  normalized: RawLine[],
): { lines: RawLine[]; newSeq: number } {
  if (payloadType === 'message') {
    const line = buildCodexMessageLine(payload, sessionId, timestamp, seq);
    return line ? { lines: [line], newSeq: seq + 1 } : { lines: [], newSeq: seq };
  }
  if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
    return {
      lines: [buildCodexToolUseLine(payload, payloadType, sessionId, timestamp, seq)],
      newSeq: seq + 1,
    };
  }
  if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
    return {
      lines: [buildCodexToolResultLine(payload, sessionId, timestamp, seq)],
      newSeq: seq + 1,
    };
  }
  if (payloadType === 'token_count') {
    applyCodexTokenCountToNormalized(payload, normalized);
  }
  return { lines: [], newSeq: seq };
}

/** `session_meta` の `cli_version`。空文字は「無い」と同じ扱いにする（version を空で上書きしない）。 */
function readCodexCliVersion(payload: Record<string, unknown>): string | null {
  const cliVersion = payload.cli_version;
  return typeof cliVersion === 'string' && cliVersion ? cliVersion : null;
}

/** payload を持たない / オブジェクトでないレコードは、どの型でも正規化の対象外。 */
function hasPayloadObject(record: RawLine): record is RawLine & { payload: Record<string, unknown> } {
  return !!record.payload && typeof record.payload === 'object';
}

export function normalizeCodexRecords(records: readonly RawLine[], fallbackSessionId: string): {
  normalized: RawLine[];
  sessionId: string;
  version: string;
  source: 'codex';
} {
  const normalized: RawLine[] = [];
  let seq = 0;
  // sessionId はループ前に確定させる。ループ中に session_meta で更新する形だと、
  // session_meta より前に現れたレコードだけ fallback 値で採番され、同一レコードが
  // JsonlSessionReader 側（先に全走査して解決する）と別 uuid になる。
  const sessionId = extractCodexSessionId(records) ?? fallbackSessionId;
  let version = '';

  for (const record of records) {
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
    if (!hasPayloadObject(record)) continue;
    if (record.type === 'session_meta') {
      version = readCodexCliVersion(record.payload) ?? version;
      continue;
    }
    if (record.type === 'event_msg') {
      const { lines, newSeq } = normalizeCodexEventMsg(record.payload, normalized, seq, sessionId, timestamp);
      normalized.push(...lines);
      seq = newSeq;
      continue;
    }
    if (record.type !== 'response_item') continue;
    const payload = record.payload;
    const payloadType = typeof payload.type === 'string' ? payload.type : '';
    const { lines, newSeq } = normalizeCodexResponseItem(payload, payloadType, sessionId, timestamp, seq, normalized);
    normalized.push(...lines);
    seq = newSeq;
  }
  return { normalized, sessionId, version, source: 'codex' };
}
