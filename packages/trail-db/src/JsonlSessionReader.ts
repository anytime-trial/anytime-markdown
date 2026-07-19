// JsonlSessionReader.ts — load TrailMessage[] from a JSONL session file

import fs from 'node:fs';
import path from 'node:path';
import type { TrailMessage, TrailToolCall } from '@anytime-markdown/trail-core';

import { codexMessageUuid, extractCodexSessionId } from './codexMessageUuid';

interface RawLine {
  uuid?: string;
  parentUuid?: string | null;
  type?: string;
  subtype?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: string | readonly RawContentBlock[];
    stop_reason?: string;
  };
  payload?: Record<string, unknown>;
  call_id?: string;
}

interface RawContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export class JsonlSessionReader {
  static loadFromFile(filePath: string): readonly TrailMessage[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const rawRecords: RawLine[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let raw: RawLine;
      try {
        raw = JSON.parse(line) as RawLine;
      } catch {
        continue;
      }
      rawRecords.push(raw);
    }

    // uuid は取り込み経路（TrailDatabase.normalizeCodexRecords）と一致させる必要がある。
    // 不一致だと message_commits.message_uuid が実在しない行を指し、FK OFF のため
    // orphan として静かに蓄積する。fallback の導出も取り込み側と同じ規則に揃える。
    const fallbackSessionId = path.basename(filePath).replace(/\.jsonl$/i, '');
    const normalized = JsonlSessionReader.normalizeRecords(rawRecords, fallbackSessionId);
    const messages: TrailMessage[] = [];
    for (const raw of normalized) {
      if (!raw.uuid || !raw.type || raw.isMeta) continue;
      if (raw.type !== 'user' && raw.type !== 'assistant' && raw.type !== 'system') continue;

      const toolCalls = JsonlSessionReader.extractToolCalls(raw);
      messages.push({
        uuid: raw.uuid,
        parentUuid: raw.parentUuid ?? null,
        type: raw.type,
        timestamp: raw.timestamp ?? '',
        isSidechain: raw.isSidechain ?? false,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }
    return messages;
  }

  private static normalizeMessagePayload(
    payload: Record<string, unknown>,
    sessionId: string,
    timestamp: string,
    seq: number,
  ): { line: RawLine | null; newSeq: number } {
    const role = typeof payload.role === 'string' ? payload.role : '';
    if (role !== 'user' && role !== 'assistant' && role !== 'developer' && role !== 'system') {
      return { line: null, newSeq: seq };
    }
    const text = JsonlSessionReader.extractCodexText(payload.content);
    const normalizedTypeInner = role === 'assistant' ? 'assistant' : 'system';
    const normalizedType = role === 'user' ? 'user' : normalizedTypeInner;
    return {
      line: {
        uuid: codexMessageUuid(sessionId, seq),
        type: normalizedType,
        subtype: role,
        timestamp,
        message: { content: text ?? '' },
      },
      newSeq: seq + 1,
    };
  }

  private static normalizeFunctionCallPayload(
    payload: Record<string, unknown>,
    payloadType: string,
    sessionId: string,
    timestamp: string,
    seq: number,
  ): { line: RawLine; newSeq: number } {
    const id = typeof payload.call_id === 'string' ? payload.call_id : `codex-call-${seq}`;
    const name = typeof payload.name === 'string' ? payload.name : 'tool';
    const rawInput = payloadType === 'function_call' ? payload.arguments : payload.input;
    let parsedInput: Record<string, unknown> = {};
    if (typeof rawInput === 'string' && rawInput.trim()) {
      try {
        parsedInput = JSON.parse(rawInput) as Record<string, unknown>;
      } catch {
        parsedInput = { raw: rawInput };
      }
    } else if (rawInput && typeof rawInput === 'object') {
      parsedInput = rawInput as Record<string, unknown>;
    }
    return {
      line: {
        uuid: codexMessageUuid(sessionId, seq),
        type: 'assistant',
        timestamp,
        message: { content: [{ type: 'tool_use', id, name, input: parsedInput }] },
      },
      newSeq: seq + 1,
    };
  }

  private static normalizeResponseItem(
    record: RawLine,
    sessionId: string,
    seq: number,
  ): { lines: RawLine[]; newSeq: number } {
    if (!record.payload || typeof record.payload !== 'object') return { lines: [], newSeq: seq };
    const payload = record.payload;
    const payloadType = typeof payload.type === 'string' ? payload.type : '';
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';

    if (payloadType === 'message') {
      const { line, newSeq } = JsonlSessionReader.normalizeMessagePayload(payload, sessionId, timestamp, seq);
      return { lines: line ? [line] : [], newSeq };
    }
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const { line, newSeq } = JsonlSessionReader.normalizeFunctionCallPayload(payload, payloadType, sessionId, timestamp, seq);
      return { lines: [line], newSeq };
    }
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      const id = typeof payload.call_id === 'string' ? payload.call_id : '';
      const output = typeof payload.output === 'string'
        ? payload.output
        : JSON.stringify(payload.output ?? '');
      return {
        lines: [{
          uuid: codexMessageUuid(sessionId, seq),
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
        }],
        newSeq: seq + 1,
      };
    }
    return { lines: [], newSeq: seq };
  }

  private static normalizeRecords(
    records: readonly RawLine[],
    fallbackSessionId: string,
  ): readonly RawLine[] {
    const hasCodexEnvelope = records.some(
      (r) => r.type === 'session_meta' || r.type === 'response_item' || r.type === 'event_msg',
    );
    if (!hasCodexEnvelope) return records;

    const sessionId = extractCodexSessionId(records) ?? fallbackSessionId;
    const normalized: RawLine[] = [];
    let seq = 0;
    for (const record of records) {
      if (record.type === 'response_item') {
        const { lines, newSeq } = JsonlSessionReader.normalizeResponseItem(record, sessionId, seq);
        normalized.push(...lines);
        seq = newSeq;
      }
    }
    return normalized;
  }

  private static extractCodexText(content: unknown): string | null {
    if (!Array.isArray(content)) return null;
    const texts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const text = (block as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) texts.push(text);
    }
    return texts.length > 0 ? texts.join('\n') : null;
  }

  private static extractToolCalls(raw: RawLine): readonly TrailToolCall[] {
    if (!Array.isArray(raw.message?.content)) return [];
    return (raw.message.content as readonly RawContentBlock[])
      .filter((b) => b.type === 'tool_use' && b.id && b.name)
      .map((b) => ({
        id: b.id as string,
        name: b.name as string,
        input: b.input ?? {},
      }));
  }
}
