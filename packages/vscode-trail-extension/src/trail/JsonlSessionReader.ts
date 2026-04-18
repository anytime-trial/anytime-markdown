// JsonlSessionReader.ts — load TrailMessage[] from a JSONL session file

import fs from 'node:fs';
import type { TrailMessage, TrailToolCall } from '@anytime-markdown/trail-core';

interface RawLine {
  uuid?: string;
  parentUuid?: string | null;
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: string | readonly RawContentBlock[];
    stop_reason?: string;
  };
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

    const messages: TrailMessage[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let raw: RawLine;
      try {
        raw = JSON.parse(line) as RawLine;
      } catch {
        continue;
      }
      if (!raw.uuid || !raw.type || raw.isMeta) continue;
      if (raw.type !== 'user' && raw.type !== 'assistant') continue;

      const toolCalls = JsonlSessionReader.extractToolCalls(raw);
      messages.push({
        uuid: raw.uuid,
        parentUuid: raw.parentUuid ?? null,
        type: raw.type as 'user' | 'assistant',
        timestamp: raw.timestamp ?? '',
        isSidechain: raw.isSidechain ?? false,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }
    return messages;
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
