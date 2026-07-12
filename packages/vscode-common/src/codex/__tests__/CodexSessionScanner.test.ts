import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexSessionScanner } from '../CodexSessionScanner';

// 実 FS を使った統合テスト（一時ディレクトリに rollout fixture を書き出して走査）。

const FIXED_NOW = new Date('2026-06-26T12:00:00.000Z');

interface RolloutSpec {
  readonly date: string; // 'YYYY/MM/DD'（開始日 = パス階層）
  readonly sessionId: string;
  readonly cwd: string;
  readonly startedAt: string;
  readonly lastActivity: string;
  readonly inputTokens?: number;
  readonly totalTokens?: number;
  readonly rateLimits?: {
    readonly primaryPercent: number;
    readonly primaryReset: number;
    readonly secondaryPercent: number;
    readonly secondaryReset: number;
  };
  /** base_instructions.text のサイズ（22KB 級先頭行の再現）。 */
  readonly bigMetaBytes?: number;
  /** 末尾 token_count から最終行までに挟むノイズ行数（段階読みの検証）。 */
  readonly trailingNoiseLines?: number;
}

function writeRollout(root: string, spec: RolloutSpec): string {
  const dir = path.join(root, spec.date);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${spec.startedAt.replace(/[:.]/g, '-')}-${spec.sessionId}.jsonl`);

  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      timestamp: spec.startedAt,
      type: 'session_meta',
      payload: {
        id: spec.sessionId,
        timestamp: spec.startedAt,
        cwd: spec.cwd,
        base_instructions: { text: 'X'.repeat(spec.bigMetaBytes ?? 16) },
      },
    })
  );
  if (spec.inputTokens !== undefined) {
    lines.push(
      JSON.stringify({
        timestamp: spec.lastActivity,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: spec.totalTokens !== undefined
              ? { total_tokens: spec.totalTokens }
              : { input_tokens: 999999 },
            last_token_usage: { input_tokens: spec.inputTokens, cached_input_tokens: 1 },
            model_context_window: 272000,
          },
          ...(spec.rateLimits ? {
            rate_limits: {
              limit_id: 'codex',
              primary: {
                used_percent: spec.rateLimits.primaryPercent,
                window_minutes: 300,
                resets_at: spec.rateLimits.primaryReset,
              },
              secondary: {
                used_percent: spec.rateLimits.secondaryPercent,
                window_minutes: 10080,
                resets_at: spec.rateLimits.secondaryReset,
              },
              plan_type: 'plus',
            },
          } : {}),
        },
      })
    );
  }
  // token_count の後ろにノイズ行（最終行は timestamp を持ち最終アクティビティを示す）。
  const noise = spec.trailingNoiseLines ?? 1;
  for (let i = 0; i < noise; i++) {
    lines.push(JSON.stringify({ timestamp: spec.lastActivity, type: 'event_msg', payload: { type: 'agent_message' } }));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function makeScanner(root: string, overrides: Partial<{ retentionDays: number; maxFiles: number; cacheTtlMs: number }> = {}) {
  const logs: string[] = [];
  const scanner = new CodexSessionScanner({
    rootDir: root,
    retentionDays: overrides.retentionDays ?? 7,
    now: () => FIXED_NOW,
    logger: (m) => logs.push(m),
    cacheTtlMs: overrides.cacheTtlMs ?? 15_000,
    maxFiles: overrides.maxFiles ?? 200,
  });
  return { scanner, logs };
}

describe('CodexSessionScanner', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-scan-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns sessions whose cwd is within a worktree, with source codex and read-only fields', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'sid-in',
      cwd: '/repo/packages/foo',
      startedAt: '2026-06-26T03:24:55.229Z',
      lastActivity: '2026-06-26T03:26:59.626Z',
      inputTokens: 45334,
    });
    const { scanner } = makeScanner(root);
    const out = scanner.scan(['/repo']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sessionId: 'sid-in',
      source: 'codex',
      editing: false,
      file: '',
      branch: '',
      workspacePath: '/repo/packages/foo',
      contextTokens: 45334,
      timestamp: '2026-06-26T03:26:59.626Z',
    });
    expect(out[0].sessionEdits).toEqual([]);
    expect(out[0].plannedEdits).toEqual([]);
  });

  it('excludes sessions whose cwd is outside every worktree', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'sid-out',
      cwd: '/some/other/repo',
      startedAt: '2026-06-26T03:24:55.229Z',
      lastActivity: '2026-06-26T03:26:59.626Z',
      inputTokens: 100,
    });
    const { scanner } = makeScanner(root);
    expect(scanner.scan(['/repo'])).toHaveLength(0);
  });

  it('excludes sessions whose last activity is older than retention', () => {
    writeRollout(root, {
      date: '2026/06/10', // 16 days before now
      sessionId: 'sid-old',
      cwd: '/repo',
      startedAt: '2026-06-10T00:00:00.000Z',
      lastActivity: '2026-06-10T00:05:00.000Z',
      inputTokens: 100,
    });
    const { scanner } = makeScanner(root, { retentionDays: 7 });
    expect(scanner.scan(['/repo'])).toHaveLength(0);
  });

  it('keeps a long-lived session that started outside the window but was active within retention (margin + mtime)', () => {
    // 開始日は走査窓ぎりぎり(now-8d = retention7 + margin2 で覆える)、最終活動は最近。
    writeRollout(root, {
      date: '2026/06/18',
      sessionId: 'sid-long',
      cwd: '/repo',
      startedAt: '2026-06-18T00:00:00.000Z',
      lastActivity: '2026-06-26T01:00:00.000Z',
      inputTokens: 200,
    });
    const { scanner } = makeScanner(root, { retentionDays: 7 });
    const out = scanner.scan(['/repo']);
    expect(out.map((a) => a.sessionId)).toContain('sid-long');
  });

  it('parses a 22KB-class first line (base_instructions) and a token_count far from the tail', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'sid-big',
      cwd: '/repo',
      startedAt: '2026-06-26T03:24:55.229Z',
      lastActivity: '2026-06-26T03:30:00.000Z',
      inputTokens: 88888,
      bigMetaBytes: 22_000,
      trailingNoiseLines: 50,
    });
    const { scanner } = makeScanner(root);
    const out = scanner.scan(['/repo']);
    expect(out).toHaveLength(1);
    expect(out[0].sessionId).toBe('sid-big');
    expect(out[0].contextTokens).toBe(88888);
  });

  it('sets contextTokens undefined when no token_count is present', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'sid-notok',
      cwd: '/repo',
      startedAt: '2026-06-26T03:24:55.229Z',
      lastActivity: '2026-06-26T03:26:00.000Z',
    });
    const { scanner } = makeScanner(root);
    const out = scanner.scan(['/repo']);
    expect(out).toHaveLength(1);
    expect(out[0].contextTokens).toBeUndefined();
  });

  it('sorts by most recent activity first', () => {
    writeRollout(root, { date: '2026/06/26', sessionId: 'older', cwd: '/repo', startedAt: '2026-06-26T01:00:00.000Z', lastActivity: '2026-06-26T01:00:00.000Z', inputTokens: 1 });
    writeRollout(root, { date: '2026/06/26', sessionId: 'newer', cwd: '/repo', startedAt: '2026-06-26T02:00:00.000Z', lastActivity: '2026-06-26T05:00:00.000Z', inputTokens: 1 });
    const { scanner } = makeScanner(root);
    expect(scanner.scan(['/repo']).map((a) => a.sessionId)).toEqual(['newer', 'older']);
  });

  it('returns [] when worktree list is empty', () => {
    writeRollout(root, { date: '2026/06/26', sessionId: 'x', cwd: '/repo', startedAt: '2026-06-26T03:00:00.000Z', lastActivity: '2026-06-26T03:00:00.000Z', inputTokens: 1 });
    const { scanner } = makeScanner(root);
    expect(scanner.scan([])).toEqual([]);
  });

  it('caches results within the TTL (does not re-scan)', () => {
    writeRollout(root, { date: '2026/06/26', sessionId: 'cached', cwd: '/repo', startedAt: '2026-06-26T03:00:00.000Z', lastActivity: '2026-06-26T03:00:00.000Z', inputTokens: 1 });
    const { scanner } = makeScanner(root);
    const first = scanner.scan(['/repo']);
    // 走査後にファイルを追加しても TTL 内なら結果は変わらない。
    writeRollout(root, { date: '2026/06/26', sessionId: 'added', cwd: '/repo', startedAt: '2026-06-26T04:00:00.000Z', lastActivity: '2026-06-26T04:00:00.000Z', inputTokens: 1 });
    const second = scanner.scan(['/repo']);
    expect(second).toBe(first);
    expect(second.map((a) => a.sessionId)).toEqual(['cached']);
  });

  it('logs and truncates when maxFiles is exceeded (no silent truncation)', () => {
    for (let i = 0; i < 5; i++) {
      writeRollout(root, { date: '2026/06/26', sessionId: `s${i}`, cwd: '/repo', startedAt: `2026-06-26T0${i}:00:00.000Z`, lastActivity: `2026-06-26T0${i}:00:00.000Z`, inputTokens: 1 });
    }
    const { scanner, logs } = makeScanner(root, { maxFiles: 2 });
    scanner.scan(['/repo']);
    expect(logs.some((l) => l.includes('maxFiles'))).toBe(true);
  });

  it('keeps the newest account-wide Codex usage snapshot and hides expired windows', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'workspace-session',
      cwd: '/repo',
      startedAt: '2026-06-26T03:00:00.000Z',
      lastActivity: '2026-06-26T03:10:00.000Z',
      inputTokens: 1,
      rateLimits: {
        primaryPercent: 99,
        primaryReset: Math.floor(new Date('2026-06-26T11:00:00.000Z').getTime() / 1000),
        secondaryPercent: 8,
        secondaryReset: Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000),
      },
    });
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'account-latest',
      cwd: '/other',
      startedAt: '2026-06-26T04:00:00.000Z',
      lastActivity: '2026-06-26T04:10:00.000Z',
      inputTokens: 1,
      rateLimits: {
        primaryPercent: 11,
        primaryReset: Math.floor(new Date('2026-06-26T13:00:00.000Z').getTime() / 1000),
        secondaryPercent: 17,
        secondaryReset: Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000),
      },
    });
    const { scanner } = makeScanner(root);
    scanner.scan(['/repo']);

    expect(scanner.getUsageSnapshot()).toEqual({
      observedAt: '2026-06-26T04:10:00.000Z',
      rows: [
        {
          key: 'session',
          label: 'Session (5h)',
          percent: 11,
          severity: 'normal',
          resetsAt: '2026-06-26T13:00:00.000Z',
        },
        {
          key: 'weekly_all',
          label: 'Weekly (7d)',
          percent: 17,
          severity: 'normal',
          resetsAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns no Codex usage snapshot when every observed window has reset', () => {
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'expired',
      cwd: '/repo',
      startedAt: '2026-06-26T03:00:00.000Z',
      lastActivity: '2026-06-26T03:10:00.000Z',
      inputTokens: 1,
      rateLimits: {
        primaryPercent: 11,
        primaryReset: Math.floor(new Date('2026-06-26T11:00:00.000Z').getTime() / 1000),
        secondaryPercent: 17,
        secondaryReset: Math.floor(new Date('2026-06-26T11:30:00.000Z').getTime() / 1000),
      },
    });
    const { scanner } = makeScanner(root);
    scanner.scan(['/repo']);

    expect(scanner.getUsageSnapshot()).toBeNull();
  });

  it('summarizes Codex today stats by JST last activity using session cumulative tokens', () => {
    writeRollout(root, {
      date: '2026/06/25',
      sessionId: 'today-a',
      cwd: '/repo',
      startedAt: '2026-06-25T23:00:00.000Z',
      lastActivity: '2026-06-26T01:00:00.000Z',
      inputTokens: 1,
      totalTokens: 100,
    });
    writeRollout(root, {
      date: '2026/06/25',
      sessionId: 'yesterday-jst',
      cwd: '/repo',
      startedAt: '2026-06-25T01:00:00.000Z',
      lastActivity: '2026-06-25T14:00:00.000Z',
      inputTokens: 1,
      totalTokens: 900,
    });
    writeRollout(root, {
      date: '2026/06/26',
      sessionId: 'outside-worktree',
      cwd: '/other',
      startedAt: '2026-06-26T02:00:00.000Z',
      lastActivity: '2026-06-26T02:30:00.000Z',
      inputTokens: 1,
      totalTokens: 500,
    });
    const { scanner } = makeScanner(root);
    scanner.scan(['/repo']);

    expect(scanner.getTodayStats()).toEqual({ sessionCount: 1, totalTokens: 100 });
  });

  it('does not throw on a malformed first line (skips the file)', () => {
    const dir = path.join(root, '2026/06/26');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rollout-bad.jsonl'), '{"type":"session_meta","payload":{"id":"x"\n');
    const { scanner } = makeScanner(root);
    expect(scanner.scan(['/repo'])).toEqual([]);
  });
});
