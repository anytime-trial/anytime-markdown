import {
  parseCodexSessionMeta,
  extractCodexContextTokens,
  extractCodexLastActivity,
} from '../parseCodexRollout';

// Real rollout shape (verified against ~/.codex/sessions/.../rollout-*.jsonl):
// 1st line: { timestamp, type: 'session_meta', payload: { id, timestamp, cwd, base_instructions, ... } }
// token_count: { timestamp, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage, last_token_usage, model_context_window } } }
// last line:  { timestamp, type: 'event_msg', payload: {...} }

describe('parseCodexSessionMeta', () => {
  it('extracts sessionId / cwd / startedAt from a session_meta first line', () => {
    const line = JSON.stringify({
      timestamp: '2026-06-26T03:24:55.229Z',
      type: 'session_meta',
      payload: {
        id: '019f01f5-83fc-7782-a37c-0a8daffe4404',
        timestamp: '2026-06-26T03:24:55.229Z',
        cwd: '/anytime-markdown',
        base_instructions: { text: 'x' },
      },
    });
    expect(parseCodexSessionMeta(line)).toEqual({
      sessionId: '019f01f5-83fc-7782-a37c-0a8daffe4404',
      cwd: '/anytime-markdown',
      startedAt: '2026-06-26T03:24:55.229Z',
    });
  });

  it('handles a 22KB-class first line with base_instructions.text (full line, not a substring)', () => {
    const bigText = 'A'.repeat(22_000);
    const line = JSON.stringify({
      timestamp: '2026-06-26T03:24:55.229Z',
      type: 'session_meta',
      payload: {
        id: 'sid-1',
        timestamp: '2026-06-26T03:24:55.229Z',
        cwd: '/repo',
        base_instructions: { text: bigText },
      },
    });
    expect(line.length).toBeGreaterThan(22_000);
    const meta = parseCodexSessionMeta(line);
    expect(meta?.sessionId).toBe('sid-1');
    expect(meta?.cwd).toBe('/repo');
  });

  it('falls back to top-level timestamp when payload.timestamp is absent', () => {
    const line = JSON.stringify({
      timestamp: '2026-06-26T01:00:00.000Z',
      type: 'session_meta',
      payload: { id: 'sid-2', cwd: '/repo' },
    });
    expect(parseCodexSessionMeta(line)?.startedAt).toBe('2026-06-26T01:00:00.000Z');
  });

  it('returns null for a non-session_meta type', () => {
    const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count' } });
    expect(parseCodexSessionMeta(line)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseCodexSessionMeta(JSON.stringify({ type: 'session_meta', payload: { cwd: '/r' } }))).toBeNull();
    expect(parseCodexSessionMeta(JSON.stringify({ type: 'session_meta', payload: { id: 'x' } }))).toBeNull();
  });

  it('returns null on malformed / partial JSON (truncated big line)', () => {
    const truncated = '{"type":"session_meta","payload":{"id":"x","cwd":"/r","base_instructions":{"text":"AAAA';
    expect(parseCodexSessionMeta(truncated)).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseCodexSessionMeta('')).toBeNull();
  });
});

describe('extractCodexContextTokens', () => {
  function tokenCountLine(inputTokens: number, cached: number): string {
    return JSON.stringify({
      timestamp: '2026-06-26T03:26:59.623Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 184637, cached_input_tokens: 145152 },
          last_token_usage: { input_tokens: inputTokens, cached_input_tokens: cached },
          model_context_window: 272000,
        },
      },
    });
  }

  it('returns last_token_usage.input_tokens from the last token_count event', () => {
    const tail = [tokenCountLine(10000, 8000), 'noise', tokenCountLine(45334, 42368)].join('\n');
    expect(extractCodexContextTokens(tail)).toBe(45334);
  });

  it('does NOT use total_token_usage (cumulative) and does NOT add cached (it is a subset of input)', () => {
    const tail = tokenCountLine(45334, 42368);
    expect(extractCodexContextTokens(tail)).toBe(45334);
  });

  it('returns null when no token_count event is present', () => {
    const tail = JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message' } });
    expect(extractCodexContextTokens(tail)).toBeNull();
  });

  it('skips malformed lines and keeps scanning for a valid token_count', () => {
    const tail = ['{"broken', tokenCountLine(777, 100), '}}}garbage'].join('\n');
    expect(extractCodexContextTokens(tail)).toBe(777);
  });

  it('returns null for empty input', () => {
    expect(extractCodexContextTokens('')).toBeNull();
  });
});

describe('extractCodexLastActivity', () => {
  it('returns the timestamp of the last line carrying a timestamp', () => {
    const tail = [
      JSON.stringify({ timestamp: '2026-06-26T03:25:00.000Z', type: 'event_msg' }),
      JSON.stringify({ timestamp: '2026-06-26T03:26:59.626Z', type: 'event_msg' }),
    ].join('\n');
    expect(extractCodexLastActivity(tail)).toBe('2026-06-26T03:26:59.626Z');
  });

  it('ignores trailing lines without a timestamp', () => {
    const tail = [
      JSON.stringify({ timestamp: '2026-06-26T03:26:59.626Z', type: 'event_msg' }),
      '{"no":"timestamp"}',
      '',
    ].join('\n');
    expect(extractCodexLastActivity(tail)).toBe('2026-06-26T03:26:59.626Z');
  });

  it('returns empty string when no timestamp is found', () => {
    expect(extractCodexLastActivity('{"a":1}\n{"b":2}')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(extractCodexLastActivity('')).toBe('');
  });
});
