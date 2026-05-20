// JsonlSessionReader.ts — load TrailMessage[] from a JSONL session file

import fs from 'node:fs';
import type { TrailMessage, TrailToolCall } from '@anytime-markdown/trail-core';

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

    const normalized = JsonlSessionReader.normalizeRecords(rawRecords);
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

  private static normalizeRecords(records: readonly RawLine[]): readonly RawLine[] {
    const hasCodexEnvelope = records.some(
      (r) => r.type === 'session_meta' || r.type === 'response_item' || r.type === 'event_msg',
    );
    if (!hasCodexEnvelope) return records;

    const normalized: RawLine[] = [];
    let seq = 0;
    for (const record of records) {
      const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
      if (record.type === 'response_item' && record.payload && typeof record.payload === 'object') {
        const payload = record.payload;
        const payloadType = typeof payload.type === 'string' ? payload.type : '';
        if (payloadType === 'message') {
          const role = typeof payload.role === 'string' ? payload.role : '';
          if (role === 'user' || role === 'assistant' || role === 'developer' || role === 'system') {
            const text = JsonlSessionReader.extractCodexText(payload.content);
            const normalizedTypeInner = role === 'assistant' ? 'assistant' : 'system';
            const normalizedType = role === 'user' ? 'user' : normalizedTypeInner;
            normalized.push({
              uuid: `codex-${seq++}`,
              type: normalizedType,
              subtype: role,
              timestamp,
              message: { content: text ?? '' },
            });
          }
          continue;
        }
        if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
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
          normalized.push({
            uuid: `codex-${seq++}`,
            type: 'assistant',
            timestamp,
            message: {
              content: [{ type: 'tool_use', id, name, input: parsedInput }],
            },
          });
          continue;
        }
        if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
          const id = typeof payload.call_id === 'string' ? payload.call_id : '';
          const output = typeof payload.output === 'string'
            ? payload.output
            : JSON.stringify(payload.output ?? '');
          normalized.push({
            uuid: `codex-${seq++}`,
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
          });
        }
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
