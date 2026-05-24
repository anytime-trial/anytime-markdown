/**
 * Characterization tests — aggregation and token helpers
 *
 * Covers:
 *   - getAllAssistantMessages
 *   - getSessionCosts / getAllSessionCosts
 *   - getAllDailyCounts
 *   - getAllMessageToolCalls (no cutoff and with cutoff)
 *   - getDailyTokensToday
 *   - getSessionTokens
 *   - rebuildSessionCostsPublic / rebuildDailyCountsPublic / rebuildSessionStatsPublic
 */

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ columns: string[]; values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

function insertSession(db: TrailDatabase, id: string, opts: {
  source?: string;
  repoName?: string;
  model?: string;
  startTime?: string;
  endTime?: string;
} = {}): void {
  const {
    source = 'claude_code',
    repoName = 'test-repo',
    model = 'claude-sonnet-4-6',
    startTime = '2026-01-15T00:00:00.000Z',
    endTime = '2026-01-15T01:00:00.000Z',
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO sessions
       (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
        message_count, file_path, file_size, imported_at, source)
     VALUES (?, ?, ?, '', '', ?, ?, ?, 0, ?, 0, '2026-01-15T01:00:00.000Z', ?)`,
    [id, id, repoId(db, repoName), model, startTime, endTime, `/tmp/${id}.jsonl`, source],
  );
}

function insertAssistantMsg(db: TrailDatabase, uuid: string, sessionId: string, opts: {
  toolCallsJson?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  timestamp?: string;
  model?: string;
} = {}): void {
  const {
    toolCallsJson = null,
    inputTokens = 100,
    outputTokens = 50,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    timestamp = '2026-01-15T00:10:00.000Z',
    model = 'claude-sonnet-4-6',
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO messages
       (uuid, session_id, type, model, timestamp, tool_calls,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, sessionId, model, timestamp, toolCallsJson, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getAllAssistantMessages
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getAllAssistantMessages', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no messages', () => {
    expect(db.getAllAssistantMessages()).toEqual([]);
  });

  it('returns only messages with non-null tool_calls', () => {
    insertSession(db, 's1');
    insertAssistantMsg(db, 'm1', 's1', { toolCallsJson: null });
    insertAssistantMsg(db, 'm2', 's1', { toolCallsJson: JSON.stringify([{ tool: 'bash' }]) });
    const msgs = db.getAllAssistantMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].tool_calls).toContain('bash');
    expect(typeof msgs[0].output_tokens).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSessionCosts / getAllSessionCosts
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getSessionCosts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when session has no costs', () => {
    insertSession(db, 's1');
    expect(db.getSessionCosts('s1')).toEqual([]);
  });

  it('returns cost rows after rebuildSessionCostsPublic', () => {
    insertSession(db, 's1');
    insertAssistantMsg(db, 'm1', 's1', { inputTokens: 500, outputTokens: 200 });
    db.rebuildSessionCostsPublic();
    const costs = db.getSessionCosts('s1');
    expect(costs.length).toBeGreaterThanOrEqual(1);
    const total = costs[0];
    expect(total.input_tokens).toBe(500);
    expect(total.output_tokens).toBe(200);
    expect(typeof total.estimated_cost_usd).toBe('number');
  });
});

describe('TrailDatabase.getAllSessionCosts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no session_costs', () => {
    expect(db.getAllSessionCosts()).toEqual([]);
  });

  it('returns costs for multiple sessions', () => {
    insertSession(db, 's1');
    insertSession(db, 's2');
    insertAssistantMsg(db, 'm1', 's1', { inputTokens: 100 });
    insertAssistantMsg(db, 'm2', 's2', { inputTokens: 200 });
    db.rebuildSessionCostsPublic();
    const all = db.getAllSessionCosts();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ids = all.map(r => r.session_id);
    expect(ids).toContain('s1');
    expect(ids).toContain('s2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllDailyCounts
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getAllDailyCounts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no daily_counts', () => {
    expect(db.getAllDailyCounts()).toEqual([]);
  });

  it('returns rows after rebuildDailyCountsPublic', () => {
    insertSession(db, 's1', { startTime: '2026-01-15T00:00:00.000Z', endTime: '2026-01-15T01:00:00.000Z' });
    insertAssistantMsg(db, 'm1', 's1', { inputTokens: 100, outputTokens: 50, timestamp: '2026-01-15T00:10:00.000Z' });
    db.rebuildDailyCountsPublic();
    const counts = db.getAllDailyCounts();
    expect(counts.length).toBeGreaterThanOrEqual(1);
    const first = counts[0];
    expect(first).toHaveProperty('date');
    expect(first).toHaveProperty('kind');
    expect(first).toHaveProperty('key');
    expect(typeof first.count).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllMessageToolCalls
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getAllMessageToolCalls', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no tool calls', () => {
    expect(db.getAllMessageToolCalls()).toEqual([]);
  });

  it('returns all tool calls without cutoff', () => {
    insertSession(db, 's1');
    inner(db).run(
      `INSERT OR IGNORE INTO messages
         (uuid, session_id, type, model, timestamp, input_tokens, output_tokens)
       VALUES ('m1', 's1', 'assistant', 'claude-sonnet-4-6', '2026-01-10T00:00:00.000Z', 10, 5)`,
    );
    inner(db).run(
      `INSERT OR IGNORE INTO message_tool_calls
         (session_id, message_uuid, turn_index, call_index, tool_name, timestamp)
       VALUES ('s1', 'm1', 0, 0, 'bash', '2026-01-10T00:00:00.000Z')`,
    );
    const calls = db.getAllMessageToolCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].tool_name).toBe('bash');
  });

  it('filters by cutoff timestamp', () => {
    insertSession(db, 's1');
    inner(db).run(
      `INSERT OR IGNORE INTO messages
         (uuid, session_id, type, model, timestamp, input_tokens, output_tokens)
       VALUES ('m-old', 's1', 'assistant', 'claude-sonnet-4-6', '2026-01-01T00:00:00.000Z', 10, 5),
              ('m-new', 's1', 'assistant', 'claude-sonnet-4-6', '2026-06-01T00:00:00.000Z', 10, 5)`,
    );
    inner(db).run(
      `INSERT OR IGNORE INTO message_tool_calls
         (session_id, message_uuid, turn_index, call_index, tool_name, timestamp)
       VALUES ('s1', 'm-old', 0, 0, 'read_file', '2026-01-01T00:00:00.000Z'),
              ('s1', 'm-new', 1, 0, 'write_file', '2026-06-01T00:00:00.000Z')`,
    );
    const recent = db.getAllMessageToolCalls('2026-03-01T00:00:00.000Z');
    expect(recent.every(r => r.tool_name !== 'read_file')).toBe(true);
    expect(recent.some(r => r.tool_name === 'write_file')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDailyTokensToday
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getDailyTokensToday', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns 0 when no messages today', () => {
    const tokens = db.getDailyTokensToday();
    expect(typeof tokens).toBe('number');
    expect(tokens).toBeGreaterThanOrEqual(0);
  });

  it('returns positive value when there are messages today', () => {
    insertSession(db, 's-today');
    // Use 'now' equivalent — we just insert and check the return type/behavior
    const today = new Date().toISOString();
    inner(db).run(
      `INSERT OR IGNORE INTO messages
         (uuid, session_id, type, model, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
       VALUES ('today-msg', 's-today', 'assistant', 'claude-sonnet-4-6', ?, 1000, 500, 0, 0)`,
      [today],
    );
    const tokens = db.getDailyTokensToday();
    expect(tokens).toBeGreaterThanOrEqual(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSessionTokens
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getSessionTokens', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns 0 when session has no messages', () => {
    insertSession(db, 's1');
    expect(db.getSessionTokens('s1')).toBe(0);
  });

  it('returns 0 when session does not exist', () => {
    expect(db.getSessionTokens('nonexistent')).toBe(0);
  });

  it('returns sum of input+output tokens for session', () => {
    insertSession(db, 's1');
    insertAssistantMsg(db, 'm1', 's1', { inputTokens: 300, outputTokens: 100 });
    insertAssistantMsg(db, 'm2', 's1', { inputTokens: 200, outputTokens: 50 });
    const tokens = db.getSessionTokens('s1');
    expect(tokens).toBe(650); // (300+100) + (200+50)
  });

  it('applies missing-token correction factor when some turns have no tokens', () => {
    insertSession(db, 's2');
    // 2 turns: one with tokens, one without
    insertAssistantMsg(db, 'ms1', 's2', { inputTokens: 100, outputTokens: 50 });
    insertAssistantMsg(db, 'ms2', 's2', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
    const tokens = db.getSessionTokens('s2');
    // correction: rawTokens=150, totalTurns=2, missingTurns=1, observed=1
    // factor=2, result=Math.round(150 * 2) = 300
    expect(tokens).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rebuildSessionStatsPublic
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.rebuildSessionStatsPublic', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error on empty DB', () => {
    expect(() => db.rebuildSessionStatsPublic()).not.toThrow();
  });

  it('updates peak_context_tokens after rebuild', () => {
    insertSession(db, 's1');
    insertAssistantMsg(db, 'm1', 's1', { inputTokens: 500, outputTokens: 0, cacheReadTokens: 100 });
    db.rebuildSessionStatsPublic();
    const result = inner(db).exec(
      `SELECT peak_context_tokens FROM sessions WHERE id = 's1'`,
    );
    const val = Number(result[0]?.values[0]?.[0] ?? 0);
    // peak = max(input + cache_read + cache_creation) = 500 + 100 + 0 = 600
    expect(val).toBe(600);
  });

  it('sets interruption_reason=max_tokens for sessions ending with max_tokens', () => {
    insertSession(db, 's-maxtoken');
    inner(db).run(
      `INSERT OR IGNORE INTO messages
         (uuid, session_id, type, model, timestamp, stop_reason, input_tokens, output_tokens)
       VALUES ('m-max', 's-maxtoken', 'assistant', 'claude-sonnet-4-6', '2026-01-15T00:10:00.000Z', 'max_tokens', 100, 50)`,
    );
    db.rebuildSessionStatsPublic();
    const result = inner(db).exec(
      `SELECT interruption_reason FROM sessions WHERE id = 's-maxtoken'`,
    );
    expect(result[0]?.values[0]?.[0]).toBe('max_tokens');
  });
});
