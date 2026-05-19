import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JsonlSessionReader } from '../JsonlSessionReader';

function writeTempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-extra-'));
  const filePath = path.join(dir, 'session.jsonl');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function writeTempJsonl(lines: readonly unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-reader-'));
  const filePath = path.join(dir, 'session.jsonl');
  fs.writeFileSync(filePath, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf-8');
  return filePath;
}

describe('JsonlSessionReader', () => {
  it('loads Claude-style JSONL messages', () => {
    const filePath = writeTempJsonl([
      {
        uuid: 'u1',
        type: 'assistant',
        timestamp: '2026-04-29T00:00:00.000Z',
        message: {
          content: [{ type: 'tool_use', id: 'c1', name: 'Read', input: { file_path: 'a.ts' } }],
        },
      },
      {
        uuid: 'u2',
        type: 'user',
        timestamp: '2026-04-29T00:00:01.000Z',
        message: { content: 'ok' },
      },
    ]);

    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.toolCalls?.[0]?.name).toBe('Read');
  });

  it('normalizes Codex-style response_item entries including developer/system roles', () => {
    const filePath = writeTempJsonl([
      { type: 'session_meta', payload: { id: '019dd7d7-1c62-77a1-880e-bbcfd32cd66c' } },
      {
        timestamp: '2026-04-29T00:00:00.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      },
      {
        timestamp: '2026-04-29T00:00:01.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'developer-instruction' }] },
      },
      {
        timestamp: '2026-04-29T00:00:01.500Z',
        type: 'response_item',
        payload: { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'system-instruction' }] },
      },
      {
        timestamp: '2026-04-29T00:00:02.000Z',
        type: 'response_item',
        payload: { type: 'function_call', call_id: 'call_1', name: 'exec_command', arguments: '{"cmd":"pwd"}' },
      },
      {
        timestamp: '2026-04-29T00:00:03.000Z',
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
      },
    ]);

    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages.length).toBeGreaterThanOrEqual(3);
    const assistantTool = messages.find((m) => m.type === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
    expect(assistantTool?.toolCalls?.[0]?.name).toBe('exec_command');
    expect(messages.some((m) => m.type === 'system')).toBe(true);
  });

  it('returns empty array for a non-existent file path', () => {
    const messages = JsonlSessionReader.loadFromFile('/no/such/path/session.jsonl');
    expect(messages).toEqual([]);
  });

  it('skips malformed (non-JSON) lines gracefully', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ uuid: 'u1', type: 'user', timestamp: '2026-04-29T00:00:00.000Z', message: { content: 'hi' } }),
        'THIS IS NOT JSON',
        JSON.stringify({ uuid: 'u2', type: 'assistant', timestamp: '2026-04-29T00:00:01.000Z', message: { content: [] } }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    // u1 and u2 are valid; malformed line is skipped
    expect(messages).toHaveLength(2);
  });

  it('skips isMeta=true records', () => {
    const filePath = writeTempFile(
      JSON.stringify({ uuid: 'u1', type: 'user', isMeta: true, timestamp: '2026-04-29T00:00:00.000Z' }) + '\n' +
      JSON.stringify({ uuid: 'u2', type: 'assistant', isMeta: false, timestamp: '2026-04-29T00:00:01.000Z', message: { content: [] } }) + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0].uuid).toBe('u2');
  });

  it('skips unknown message types', () => {
    const filePath = writeTempFile(
      JSON.stringify({ uuid: 'u1', type: 'unknown_type', timestamp: '2026-04-29T00:00:00.000Z' }) + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages).toHaveLength(0);
  });

  it('handles Codex custom_tool_call payload type', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-1' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'custom_tool_call',
            call_id: 'call_x',
            name: 'my_custom_tool',
            input: { key: 'value' },
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:01.000Z',
          type: 'response_item',
          payload: {
            type: 'custom_tool_call_output',
            call_id: 'call_x',
            output: 'result-data',
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    const toolMsg = messages.find((m) => m.type === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
    expect(toolMsg?.toolCalls?.[0]?.name).toBe('my_custom_tool');
  });

  it('handles Codex function_call with non-string arguments object', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-2' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            call_id: 'call_y',
            name: 'exec_command',
            arguments: { cmd: 'echo hello' }, // object, not string
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    const toolMsg = messages.find((m) => m.type === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
    expect(toolMsg?.toolCalls?.[0]?.input).toEqual({ cmd: 'echo hello' });
  });

  it('handles Codex function_call with malformed JSON arguments string', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-3' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            call_id: 'call_z',
            name: 'exec_command',
            arguments: 'NOT-VALID-JSON',
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    const toolMsg = messages.find((m) => m.type === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
    expect(toolMsg?.toolCalls?.[0]?.input).toEqual({ raw: 'NOT-VALID-JSON' });
  });

  it('handles Codex response_item with non-array content (extractCodexText returns null)', () => {
    // When payload.content is not an array, extractCodexText returns null and text becomes ''
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-4' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: 'plain string content',
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    // A user message should still be produced
    expect(messages.some((m) => m.type === 'user')).toBe(true);
  });

  it('skips response_item with unrecognized role', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-5' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'unknown_role',
            content: [],
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages).toHaveLength(0);
  });

  it('handles function_call_output with non-string output (JSON.stringify fallback)', () => {
    const filePath = writeTempFile(
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'sess-6' } }),
        JSON.stringify({
          timestamp: '2026-04-29T00:00:00.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call_output',
            call_id: 'call_w',
            output: { nested: 'object' },
          },
        }),
      ].join('\n') + '\n',
    );
    const messages = JsonlSessionReader.loadFromFile(filePath);
    // Should produce a user message (tool_result)
    expect(messages.some((m) => m.type === 'user')).toBe(true);
  });

  it('returns empty array for empty file', () => {
    const filePath = writeTempFile('');
    const messages = JsonlSessionReader.loadFromFile(filePath);
    expect(messages).toEqual([]);
  });
});
