import {
  parseCodexSessionMeta,
  extractCodexContextTokens,
  extractCodexLastActivity,
  extractCodexRateLimits,
  extractCodexTotalTokens,
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

describe('extractCodexRateLimits', () => {
  function rateLimitLine(overrides: { primaryPercent?: unknown; secondaryPercent?: unknown; timestamp?: string } = {}): string {
    return JSON.stringify({
      timestamp: overrides.timestamp ?? '2026-07-12T13:16:08.224Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { total_tokens: 1818337 },
          last_token_usage: { input_tokens: 67223 },
        },
        rate_limits: {
          limit_id: 'codex',
          primary: { used_percent: overrides.primaryPercent ?? 11.2, window_minutes: 300, resets_at: 1783879737 },
          secondary: { used_percent: overrides.secondaryPercent ?? 8.4, window_minutes: 10080, resets_at: 1784414830 },
          plan_type: 'plus',
        },
      },
    });
  }

  it('returns the last token_count rate_limits snapshot with epoch-second reset times normalized', () => {
    const tail = [
      rateLimitLine({ primaryPercent: 1, timestamp: '2026-07-12T13:00:00.000Z' }),
      rateLimitLine({ primaryPercent: 11.2, timestamp: '2026-07-12T13:16:08.224Z' }),
    ].join('\n');
    expect(extractCodexRateLimits(tail)).toEqual({
      observedAt: '2026-07-12T13:16:08.224Z',
      rows: [
        {
          key: 'session',
          label: 'Session (5h)',
          percent: 11,
          severity: 'normal',
          resetsAt: '2026-07-12T18:08:57.000Z',
        },
        {
          key: 'weekly_all',
          label: 'Weekly (7d)',
          percent: 8,
          severity: 'normal',
          resetsAt: '2026-07-18T22:47:10.000Z',
        },
      ],
    });
  });

  it('clamps percent and derives severity from thresholds', () => {
    const snapshot = extractCodexRateLimits(rateLimitLine({ primaryPercent: 101, secondaryPercent: 80 }));
    expect(snapshot?.rows.map(row => ({ percent: row.percent, severity: row.severity }))).toEqual([
      { percent: 100, severity: 'critical' },
      { percent: 80, severity: 'warn' },
    ]);
  });

  it('drops invalid limit rows and returns null when no usable row exists', () => {
    const oneRow = extractCodexRateLimits(rateLimitLine({ primaryPercent: 'bad' }));
    expect(oneRow?.rows).toHaveLength(1);
    expect(oneRow?.rows[0]?.key).toBe('weekly_all');

    expect(extractCodexRateLimits(rateLimitLine({ primaryPercent: 'bad', secondaryPercent: 'bad' }))).toBeNull();
  });

  it('returns null when no rate_limits event is present', () => {
    expect(extractCodexRateLimits(JSON.stringify({ type: 'event_msg', payload: { type: 'token_count' } }))).toBeNull();
  });
});

describe('extractCodexTotalTokens', () => {
  function totalLine(totalTokens: unknown): string {
    return JSON.stringify({
      timestamp: '2026-07-12T13:16:08.224Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { total_tokens: totalTokens },
          last_token_usage: { input_tokens: 100 },
        },
      },
    });
  }

  it('returns total_token_usage.total_tokens from the last token_count event', () => {
    expect(extractCodexTotalTokens([totalLine(10), totalLine(1818337)].join('\n'))).toBe(1818337);
  });

  it('returns null when total_tokens is absent or invalid', () => {
    expect(extractCodexTotalTokens(totalLine('1818337'))).toBeNull();
    expect(extractCodexTotalTokens('')).toBeNull();
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
