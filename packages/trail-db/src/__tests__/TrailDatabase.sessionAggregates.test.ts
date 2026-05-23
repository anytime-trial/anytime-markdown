/**
 * Tests for TrailDatabase session-aggregate and cost-related methods.
 *
 * Covers:
 *   - getSessionCommitStats    (5213-5248)
 *   - getSessionErrorCounts    (5250-5270)
 *   - getSessionSubAgentCounts (5272-5292)
 *   - getSessionDistinctAgentIdCounts (5294-5316)
 *   - getSessionDelegatedTrackCounts  (5318-5363)
 *   - getSessionCommits        (5365-5377)
 *   - getCostOptimization      (7027-7112)
 *   - getCoverageSummary       (8292-8303)
 *   - computeToolMetrics (global path, 5954-5996)
 *   - getQualityMetricsInputs  (empty DB path)
 *   - fetchLinkedCodexSessionIdsInRange (5594-5617)
 */

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

// flip 後 release_coverage は release_id FK。tag の親 release を作り release_id を返す。
function seedReleaseAndGetId(db: TrailDatabase, tag: string): number {
  inner(db).run(
    `INSERT OR IGNORE INTO releases (tag, released_at, repo_name) VALUES (?, '2026-01-01T00:00:00.000Z', 'r')`,
    [tag],
  );
  const res = inner(db).exec('SELECT release_id FROM releases WHERE tag = ? LIMIT 1', [tag]);
  return Number(res[0]?.values?.[0]?.[0]);
}

function insertSession(
  db: TrailDatabase,
  id: string,
  opts: {
    startTime?: string;
    endTime?: string;
    source?: string;
    repoName?: string;
    model?: string;
    importedAt?: string;
  } = {},
): void {
  const {
    startTime = '2026-04-29T00:00:00.000Z',
    endTime = '2026-04-29T01:00:00.000Z',
    source = 'claude_code',
    repoName = 'test-repo',
    model = 'claude-opus-4',
    importedAt = '2026-04-29T01:00:00.000Z',
  } = opts;
  // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source
     ) VALUES (?, ?, ?, '', '', ?, ?, ?, 0, '', 0, ?, ?)`,
    [id, id, repoId, model, startTime, endTime, importedAt, source],
  );
}

function insertSessionCommit(
  db: TrailDatabase,
  sessionId: string,
  commitHash: string,
  opts: {
    linesAdded?: number;
    linesDeleted?: number;
    filesChanged?: number;
    isAiAssisted?: number;
    repoName?: string;
    committedAt?: string;
  } = {},
): void {
  const {
    linesAdded = 10,
    linesDeleted = 5,
    filesChanged = 3,
    isAiAssisted = 1,
    repoName = 'test-repo',
    committedAt = '2026-04-29T00:30:00.000Z',
  } = opts;
  // Phase H-4: session_commits.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits
       (session_id, commit_hash, commit_message, author, committed_at,
        is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id)
     VALUES (?, ?, 'test commit', 'test author', ?, ?, ?, ?, ?, ?)`,
    [sessionId, commitHash, committedAt, isAiAssisted, filesChanged, linesAdded, linesDeleted, repoId],
  );
}

function insertToolCall(
  db: TrailDatabase,
  sessionId: string,
  messageUuid: string,
  callIndex: number,
  toolName: string,
  opts: {
    isError?: number;
    filePath?: string | null;
    command?: string | null;
  } = {},
): void {
  const { isError = 0, filePath = null, command = null } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking,
       is_error, error_type, timestamp
     ) VALUES (?, ?, 0, ?, ?, ?, ?, NULL, NULL, 0, NULL, 0, ?, NULL, '2026-04-29T00:10:00.000Z')`,
    [sessionId, messageUuid, callIndex, toolName, filePath, command, isError],
  );
}

function insertMsg(
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  opts: {
    type?: string;
    timestamp?: string;
    toolCalls?: unknown[] | null;
    agentId?: string | null;
    sourceToolAssistantUuid?: string | null;
  } = {},
): void {
  const {
    type = 'assistant',
    timestamp = '2026-04-29T00:10:00.000Z',
    toolCalls = null,
    agentId = null,
    sourceToolAssistantUuid = null,
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, type, timestamp, tool_calls, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, agent_id, source_tool_assistant_uuid
     ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    [
      uuid,
      sessionId,
      type,
      timestamp,
      toolCalls != null ? JSON.stringify(toolCalls) : null,
      agentId,
      sourceToolAssistantUuid,
    ],
  );
}

// ---------------------------------------------------------------------------
//  getSessionCommitStats
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionCommitStats', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map for empty input', () => {
    expect(db.getSessionCommitStats([]).size).toBe(0);
  });

  it('returns empty map when session has no commits', () => {
    insertSession(db, 's1');
    const result = db.getSessionCommitStats(['s1']);
    expect(result.size).toBe(0);
  });

  it('returns stats for a session with commits', () => {
    insertSession(db, 's1');
    insertSessionCommit(db, 's1', 'abc1', { linesAdded: 20, linesDeleted: 10, filesChanged: 4 });
    insertSessionCommit(db, 's1', 'abc2', { linesAdded: 5, linesDeleted: 2, filesChanged: 1 });
    const result = db.getSessionCommitStats(['s1']);
    expect(result.size).toBe(1);
    const stats = result.get('s1');
    expect(stats?.commits).toBe(2);
    expect(stats?.linesAdded).toBe(25);
    expect(stats?.linesDeleted).toBe(12);
    expect(stats?.filesChanged).toBe(5);
  });

  it('handles multiple sessions independently', () => {
    insertSession(db, 's1');
    insertSession(db, 's2');
    insertSessionCommit(db, 's1', 'c1');
    insertSessionCommit(db, 's2', 'c2');
    const result = db.getSessionCommitStats(['s1', 's2']);
    expect(result.size).toBe(2);
    expect(result.get('s1')?.commits).toBe(1);
    expect(result.get('s2')?.commits).toBe(1);
  });
});

// ---------------------------------------------------------------------------
//  getSessionErrorCounts
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionErrorCounts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map for empty input', () => {
    expect(db.getSessionErrorCounts([]).size).toBe(0);
  });

  it('returns empty map when no errors', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Bash', { isError: 0 });
    const result = db.getSessionErrorCounts(['s1']);
    expect(result.has('s1')).toBe(false);
  });

  it('returns error count for session with errors', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Bash', { isError: 1 });
    insertToolCall(db, 's1', 'm1', 1, 'Read', { isError: 1 });
    const result = db.getSessionErrorCounts(['s1']);
    expect(result.get('s1')).toBe(2);
  });

  it('handles multiple sessions', () => {
    insertSession(db, 's1');
    insertSession(db, 's2');
    insertToolCall(db, 's1', 'm1', 0, 'Bash', { isError: 1 });
    insertToolCall(db, 's2', 'm2', 0, 'Write', { isError: 1 });
    insertToolCall(db, 's2', 'm2', 1, 'Edit', { isError: 1 });
    const result = db.getSessionErrorCounts(['s1', 's2']);
    expect(result.get('s1')).toBe(1);
    expect(result.get('s2')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
//  getSessionSubAgentCounts
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionSubAgentCounts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map for empty input', () => {
    expect(db.getSessionSubAgentCounts([]).size).toBe(0);
  });

  it('returns 0 entries when no Agent calls', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Bash');
    const result = db.getSessionSubAgentCounts(['s1']);
    expect(result.has('s1')).toBe(false);
  });

  it('counts Agent tool calls', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Agent');
    insertToolCall(db, 's1', 'm1', 1, 'Agent');
    insertToolCall(db, 's1', 'm2', 0, 'Bash');
    const result = db.getSessionSubAgentCounts(['s1']);
    expect(result.get('s1')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
//  getSessionDistinctAgentIdCounts
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionDistinctAgentIdCounts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map for empty input', () => {
    expect(db.getSessionDistinctAgentIdCounts([]).size).toBe(0);
  });

  it('returns 0 for session with no agent_id messages', () => {
    insertSession(db, 's1');
    insertMsg(db, 'm1', 's1', { agentId: null });
    const result = db.getSessionDistinctAgentIdCounts(['s1']);
    expect(result.has('s1')).toBe(false);
  });

  it('counts distinct agent_ids', () => {
    insertSession(db, 's1');
    insertMsg(db, 'm1', 's1', { agentId: 'agent-a' });
    insertMsg(db, 'm2', 's1', { agentId: 'agent-a' });
    insertMsg(db, 'm3', 's1', { agentId: 'agent-b' });
    const result = db.getSessionDistinctAgentIdCounts(['s1']);
    expect(result.get('s1')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
//  getSessionDelegatedTrackCounts
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionDelegatedTrackCounts', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map for empty input', () => {
    expect(db.getSessionDelegatedTrackCounts([]).size).toBe(0);
  });

  it('returns 0 for session with no Agent tool calls', () => {
    insertSession(db, 's1');
    insertMsg(db, 'm1', 's1', { type: 'assistant', toolCalls: [{ name: 'Bash', input: { command: 'ls' } }] });
    const result = db.getSessionDelegatedTrackCounts(['s1']);
    expect(result.has('s1')).toBe(false);
  });

  it('counts distinct subagent_type for Agent calls', () => {
    insertSession(db, 's1');
    // Each message has one Agent call with a different subagent_type
    insertMsg(db, 'm1', 's1', {
      type: 'assistant',
      toolCalls: [
        { name: 'Agent', input: { subagent_type: 'code-reviewer' } },
      ],
    });
    insertMsg(db, 'm2', 's1', {
      type: 'assistant',
      toolCalls: [
        { name: 'Agent', input: { subagent_type: 'debugging' } },
      ],
    });
    const result = db.getSessionDelegatedTrackCounts(['s1']);
    // 2 distinct delegated:* entries across 2 messages
    expect(result.get('s1')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
//  getSessionCommits
// ---------------------------------------------------------------------------
describe('TrailDatabase.getSessionCommits', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for session without commits', () => {
    insertSession(db, 's1');
    expect(db.getSessionCommits('s1')).toEqual([]);
  });

  it('returns commits ordered by committed_at', () => {
    insertSession(db, 's1');
    insertSessionCommit(db, 's1', 'hash-b', { committedAt: '2026-04-29T00:40:00.000Z' });
    insertSessionCommit(db, 's1', 'hash-a', { committedAt: '2026-04-29T00:20:00.000Z' });
    const commits = db.getSessionCommits('s1');
    expect(commits).toHaveLength(2);
    // Should be ordered ASC by committed_at
    expect((commits[0] as unknown as Record<string, unknown>).commit_hash).toBe('hash-a');
    expect((commits[1] as unknown as Record<string, unknown>).commit_hash).toBe('hash-b');
  });
});

// ---------------------------------------------------------------------------
//  getCostOptimization
// ---------------------------------------------------------------------------
describe('TrailDatabase.getCostOptimization', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns zero totals for empty DB', () => {
    const result = db.getCostOptimization();
    expect(result.actual.totalCost).toBe(0);
    expect(result.skillEstimate.totalCost).toBe(0);
    expect(Array.isArray(result.daily)).toBe(true);
    expect(result.modelDistribution.actual).toBeDefined();
    expect(result.modelDistribution.skillRecommended).toBeDefined();
  });

  it('returns cost data after inserting session costs', () => {
    insertSession(db, 's1');
    inner(db).run(
      `INSERT OR REPLACE INTO session_costs
         (session_id, model, input_tokens, output_tokens,
          cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
       VALUES (?, 'claude-opus-4', 1000, 500, 0, 0, 0.025)`,
      ['s1'],
    );
    const result = db.getCostOptimization();
    expect(result.actual.totalCost).toBeCloseTo(0.025, 5);
    expect(result.actual.byModel['claude-opus-4']).toBeCloseTo(0.025, 5);
  });
});

// ---------------------------------------------------------------------------
//  getCoverageSummary
// ---------------------------------------------------------------------------
describe('TrailDatabase.getCoverageSummary', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for non-existent tag', () => {
    const result = db.getCoverageSummary('v1.0.0');
    expect(result).toEqual([]);
  });

  it('returns coverage row when inserted', () => {
    const relId = seedReleaseAndGetId(db, 'v1.0.0');
    inner(db).run(
      `INSERT OR IGNORE INTO release_coverage (
         release_id, package, file_path,
         lines_total, lines_covered, lines_pct,
         statements_total, statements_covered, statements_pct,
         functions_total, functions_covered, functions_pct,
         branches_total, branches_covered, branches_pct
       ) VALUES (?, 'trail-db', '__total__', 100, 80, 80.0, 200, 160, 80.0, 50, 40, 80.0, 120, 96, 80.0)`,
      [relId],
    );
    const result = db.getCoverageSummary('v1.0.0');
    expect(result).toHaveLength(1);
    const row = result[0] as unknown as Record<string, unknown>;
    expect(row['release_tag']).toBe('v1.0.0');
    expect(row['file_path']).toBe('__total__');
  });

  it('only returns __total__ rows (not per-file rows)', () => {
    const relId = seedReleaseAndGetId(db, 'v2.0.0');
    inner(db).run(
      `INSERT OR IGNORE INTO release_coverage (
         release_id, package, file_path,
         lines_total, lines_covered, lines_pct,
         statements_total, statements_covered, statements_pct,
         functions_total, functions_covered, functions_pct,
         branches_total, branches_covered, branches_pct
       ) VALUES (?, 'trail-db', 'src/foo.ts', 10, 8, 80.0, 20, 16, 80.0, 5, 4, 80.0, 12, 10, 80.0)`,
      [relId],
    );
    inner(db).run(
      `INSERT OR IGNORE INTO release_coverage (
         release_id, package, file_path,
         lines_total, lines_covered, lines_pct,
         statements_total, statements_covered, statements_pct,
         functions_total, functions_covered, functions_pct,
         branches_total, branches_covered, branches_pct
       ) VALUES (?, 'trail-db', '__total__', 100, 80, 80.0, 200, 160, 80.0, 50, 40, 80.0, 120, 96, 80.0)`,
      [relId],
    );
    const result = db.getCoverageSummary('v2.0.0');
    expect(result).toHaveLength(1);
    const row = result[0] as unknown as Record<string, unknown>;
    expect(row['file_path']).toBe('__total__');
  });
});

// ---------------------------------------------------------------------------
//  computeToolMetrics (global path — no sessionId)
// ---------------------------------------------------------------------------
describe('TrailDatabase.computeToolMetrics (global)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns all-zero object for empty DB', () => {
    const result = db.computeToolMetrics();
    expect(result.totalEdits).toBe(0);
    expect(result.totalRetries).toBe(0);
    expect(result.totalBuildRuns).toBe(0);
    expect(result.totalBuildFails).toBe(0);
    expect(result.totalTestRuns).toBe(0);
    expect(result.totalTestFails).toBe(0);
  });

  it('counts Edit/Write tool calls as edits', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', { filePath: 'src/foo.ts' });
    insertToolCall(db, 's1', 'm2', 0, 'Write', { filePath: 'src/bar.ts' });
    const result = db.computeToolMetrics();
    expect(result.totalEdits).toBe(2);
  });

  it('counts build Bash commands', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Bash', { command: 'npm run build', isError: 0 });
    insertToolCall(db, 's1', 'm2', 0, 'Bash', { command: 'npx tsc --noEmit', isError: 1 });
    const result = db.computeToolMetrics();
    expect(result.totalBuildRuns).toBe(2);
    expect(result.totalBuildFails).toBe(1);
  });

  it('counts test Bash commands', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Bash', { command: 'npx jest src/', isError: 0 });
    insertToolCall(db, 's1', 'm2', 0, 'Bash', { command: 'npm run test', isError: 1 });
    const result = db.computeToolMetrics();
    expect(result.totalTestRuns).toBe(2);
    expect(result.totalTestFails).toBe(1);
  });

  it('counts retries (same file edited multiple times in same session)', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', { filePath: 'src/foo.ts' });
    insertToolCall(db, 's1', 'm2', 0, 'Edit', { filePath: 'src/foo.ts' });
    insertToolCall(db, 's1', 'm3', 0, 'Edit', { filePath: 'src/foo.ts' });
    const result = db.computeToolMetrics();
    // 3 edits to same file = 2 retries
    expect(result.totalRetries).toBe(2);
  });
});

// ---------------------------------------------------------------------------
//  getQualityMetricsInputs (empty DB path)
// ---------------------------------------------------------------------------
describe('TrailDatabase.getQualityMetricsInputs', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty arrays for all fields on empty DB', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.999Z';
    const result = db.getQualityMetricsInputs(from, to, from, to);
    expect(Array.isArray(result.releases)).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
    expect(Array.isArray(result.messageCommits)).toBe(true);
    expect(Array.isArray(result.commits)).toBe(true);
    expect(Array.isArray(result.previousReleases)).toBe(true);
    expect(Array.isArray(result.previousMessages)).toBe(true);
    expect(Array.isArray(result.previousMessageCommits)).toBe(true);
    expect(Array.isArray(result.previousCommits)).toBe(true);
    expect(result.releases).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
//  fetchLinkedCodexSessionIdsInRange
// ---------------------------------------------------------------------------
describe('TrailDatabase.fetchLinkedCodexSessionIdsInRange', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty set when DB is empty', () => {
    const result = db.fetchLinkedCodexSessionIdsInRange(
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:59.999Z',
    );
    expect(result.size).toBe(0);
  });

  it('returns empty set when no codex sessions are linked', () => {
    insertSession(db, 'cc1', { source: 'claude_code' });
    const result = db.fetchLinkedCodexSessionIdsInRange(
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
//  getQualityMetricsInputs — binary search path (user + assistant messages)
// ---------------------------------------------------------------------------
describe('TrailDatabase.getQualityMetricsInputs with messages', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns messages with token aggregation when user+assistant messages exist', () => {
    insertSession(db, 's1', {
      startTime: '2026-03-01T00:00:00.000Z',
      endTime: '2026-03-01T02:00:00.000Z',
      importedAt: '2026-03-01T02:00:00.000Z',
    });
    // Insert user message
    inner(db).run(
      `INSERT OR IGNORE INTO messages (
         uuid, session_id, type, timestamp, tool_calls,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
       ) VALUES (?, ?, 'user', ?, NULL, 0, 0, 0, 0)`,
      ['u1', 's1', '2026-03-01T00:10:00.000Z'],
    );
    // Insert assistant message after user message
    inner(db).run(
      `INSERT OR IGNORE INTO messages (
         uuid, session_id, type, timestamp, tool_calls,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
       ) VALUES (?, ?, 'assistant', ?, NULL, 1000, 500, 0, 0)`,
      ['a1', 's1', '2026-03-01T00:11:00.000Z'],
    );

    const from = '2026-03-01T00:00:00.000Z';
    const to = '2026-03-01T23:59:59.999Z';
    const result = db.getQualityMetricsInputs(from, to, from, to);

    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const msg = result.messages.find((m) => m.uuid === 'u1');
    expect(msg).toBeDefined();
    expect(msg!.input_tokens).toBe(1000);
    expect(msg!.output_tokens).toBe(500);
  });

  it('returns zero tokens for user message with no following assistant message', () => {
    insertSession(db, 's2', {
      startTime: '2026-03-02T00:00:00.000Z',
      endTime: '2026-03-02T02:00:00.000Z',
      importedAt: '2026-03-02T02:00:00.000Z',
    });
    inner(db).run(
      `INSERT OR IGNORE INTO messages (
         uuid, session_id, type, timestamp, tool_calls,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
       ) VALUES (?, ?, 'user', ?, NULL, 0, 0, 0, 0)`,
      ['u2', 's2', '2026-03-02T00:10:00.000Z'],
    );
    // No assistant message

    const from = '2026-03-02T00:00:00.000Z';
    const to = '2026-03-02T23:59:59.999Z';
    const result = db.getQualityMetricsInputs(from, to, from, to);

    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const msg = result.messages.find((m) => m.uuid === 'u2');
    expect(msg).toBeDefined();
    expect(msg!.input_tokens).toBe(0);
  });

  it('returns commits including files when session_commits exist in range', () => {
    insertSession(db, 's3', {
      startTime: '2026-03-03T00:00:00.000Z',
      endTime: '2026-03-03T02:00:00.000Z',
      importedAt: '2026-03-03T02:00:00.000Z',
    });
    insertSessionCommit(db, 's3', 'hash-abc', {
      committedAt: '2026-03-03T00:30:00.000Z',
      linesAdded: 10,
      linesDeleted: 2,
    });

    const from = '2026-03-03T00:00:00.000Z';
    const to = '2026-03-04T00:00:00.000Z';
    const result = db.getQualityMetricsInputs(from, to, from, to);

    expect(result.commits.length).toBeGreaterThanOrEqual(1);
    const commit = result.commits.find((c) => c.hash === 'hash-abc');
    expect(commit).toBeDefined();
    expect(commit!.lines_added).toBe(10);
    expect(Array.isArray(commit!.files)).toBe(true);
  });
});
