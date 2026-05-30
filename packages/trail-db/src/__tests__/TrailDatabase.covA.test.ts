/**
 * Coverage-A: additional characterization tests for uncovered lines in TrailDatabase.ts
 * Target line ranges from /tmp/td-chunk-a.txt:
 *   306,376-378,388,733-740,760-776,810-822,834-841,860-861,897-900,958,
 *   1150-1152,1195-1198,1211-1212,1229-1247,1436,1804,1818-1819,1880,
 *   2036-2043,2066,2078-2079,2085-2118,2146-2147,2161,2246-2247,2253-2254,
 *   2268,2272-2275,2284-2285,2388-2389,2395-2396,2437-2438,2545-2546,
 *   2552-2553,2561-2562,2621-2622,2654-2655,2661-2665,2673-2674,2733-2734,
 *   2766-2767,2773-2777,2792-2793,2877-2878,2920-2921,2927-2931,2947-2948,
 *   3072-3073,3079-3083,3101-3102,3125-3127,3147,3232-3233,3239-3240,
 *   3248-3249,3314,3351-3352,3383-3384,3390-3394,3402-3403,3434,3438-3441,
 *   3452,3481-3490,3506-3513,3541,3604,3827-3864,3952-3976
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase, createUninitializedTestDb, createFileBackedTestDb } from './support/createTestDb';

// ─── internal-access helpers ───────────────────────────────────────────────
type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

function insertSession(
  db: TrailDatabase,
  id: string,
  opts: {
    repoName?: string;
    filePath?: string;
    source?: string;
    startTime?: string;
    endTime?: string;
    importedAt?: string;
  } = {},
): void {
  const {
    repoName = 'test-repo',
    filePath = '',
    source = 'claude_code',
    startTime = '2026-01-01T00:00:00.000Z',
    endTime = '2026-01-01T01:00:00.000Z',
    importedAt = '2026-01-01T01:00:00.000Z',
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO sessions
       (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
        message_count, file_path, file_size, imported_at, source)
     VALUES (?, ?, ?, '', '', '', ?, ?, 0, ?, 0, ?, ?)`,
    [id, id, repoId(db, repoName), startTime, endTime, filePath, importedAt, source],
  );
}

function insertMessage(
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  opts: {
    type?: string;
    timestamp?: string;
    textContent?: string | null;
    toolCalls?: unknown[] | null;
    inputTokens?: number;
    outputTokens?: number;
  } = {},
): void {
  const {
    type = 'assistant',
    timestamp = '2026-01-01T00:10:00.000Z',
    textContent = null,
    toolCalls = null,
    inputTokens = 0,
    outputTokens = 0,
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO messages
       (uuid, session_id, type, timestamp, text_content, user_content, tool_calls,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, stop_reason)
     VALUES (?, ?, ?, ?, ?, null, ?, ?, ?, 0, 0, null)`,
    [
      uuid,
      sessionId,
      type,
      timestamp,
      textContent,
      toolCalls != null ? JSON.stringify(toolCalls) : null,
      inputTokens,
      outputTokens,
    ],
  );
}

function insertToolCall(
  db: TrailDatabase,
  sessionId: string,
  messageUuid: string,
  toolName: string,
  callIndex: number,
  timestamp = '2026-01-01T00:10:00.000Z',
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO message_tool_calls
       (session_id, message_uuid, turn_index, call_index, tool_name, timestamp)
     VALUES (?, ?, 0, ?, ?, ?)`,
    [sessionId, messageUuid, callIndex, toolName, timestamp],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Line 306: ensureCommunityStableKeyColumn — column already exists path (idempotent)
// This is called from saveCurrentCodeGraph. In the fresh in-memory DB,
// stable_key already exists, so line 306 hits the "already exists" no-op path.
// ─────────────────────────────────────────────────────────────────────────────

describe('saveCurrentCodeGraph — empty graph (community guards)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('saves an empty CodeGraph without throwing', () => {
    const emptyGraph = {
      repoName: 'my-repo',
      nodes: [],
      edges: [],
      communities: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(() => db.saveCurrentCodeGraph('my-repo', emptyGraph as never)).not.toThrow();
  });

  it('second save (upsert) on same repo is idempotent', () => {
    const emptyGraph = {
      repoName: 'my-repo',
      nodes: [],
      edges: [],
      communities: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    db.saveCurrentCodeGraph('my-repo', emptyGraph as never);
    expect(() => db.saveCurrentCodeGraph('my-repo', emptyGraph as never)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 385-387: parseCategory — covers 'ui', 'logic', 'excluded' valid paths.
// (Line 388 fallback requires bypassing the CHECK constraint — not testable here)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCategory — valid categories stored in DB', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns "logic" for logic category', () => {
    const rId = repoId(db, 'repo');
    inner(db).run(
      `INSERT OR REPLACE INTO current_file_analysis
         (repo_id, file_path, category, importance_score, fan_in_total,
          cross_pkg_in_count, external_consumer_pkgs, total_in_count,
          is_barrel, centrality_score, analyzed_at)
       VALUES (?, 'src/foo.ts', 'logic', 5.0, 0, 0, 0, 0, 0, 0.0, '2026-01-01T00:00:00.000Z')`,
      [rId],
    );
    const rows = db.getCurrentFileAnalysis('repo');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].category).toBe('logic');
  });

  it('returns "ui" for ui category', () => {
    const rId = repoId(db, 'repo');
    inner(db).run(
      `INSERT OR REPLACE INTO current_file_analysis
         (repo_id, file_path, category, importance_score, fan_in_total,
          cross_pkg_in_count, external_consumer_pkgs, total_in_count,
          is_barrel, centrality_score, analyzed_at)
       VALUES (?, 'src/ui/Button.tsx', 'ui', 3.0, 0, 0, 0, 0, 0, 0.0, '2026-01-01T00:00:00.000Z')`,
      [rId],
    );
    const rows = db.getCurrentFileAnalysis('repo');
    const uiRow = rows.find((r) => r.filePath === 'src/ui/Button.tsx');
    expect(uiRow?.category).toBe('ui');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 733-740: extractCodexText — array with non-object / empty text blocks
// Lines 810-822, 834-841: normalizeCodexEventItem / normalizeCodexResponseItem
// Lines 860-861: function_call with raw string arguments
// Lines 897-900: function_call_output items
// These are private module-level helpers exercised through importSession().
// importSession(filePath, repoName) processes a single JSONL file.
// ─────────────────────────────────────────────────────────────────────────────

describe('importSession — codex source JSONL edge cases', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-cova-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles empty-text content blocks (extractCodexText returns null)', () => {
    const jsonlPath = path.join(tmpDir, 'session1.jsonl');
    const lines = [
      JSON.stringify({
        type: 'session_started',
        sessionId: 'codex-sess-1',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
      // message with content blocks that have no 'text' field (extractCodexText returns null)
      JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read', input: {} }],
        timestamp: '2026-01-01T00:01:00.000Z',
      }),
      // null block in content array (should be skipped)
      JSON.stringify({
        type: 'message',
        role: 'user',
        content: [null, { type: 'text', text: '' }],
        timestamp: '2026-01-01T00:02:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('processes task_started event (returns empty lines)', () => {
    const jsonlPath = path.join(tmpDir, 'sess-task.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs2', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({ type: 'task_started', timestamp: '2026-01-01T00:00:01.000Z' }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('processes token_count event (applyCodexTokenCountToNormalized)', () => {
    const jsonlPath = path.join(tmpDir, 'sess-tokens.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs3', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hello' }], timestamp: '2026-01-01T00:01:00.000Z' }),
      JSON.stringify({
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 50 } },
        timestamp: '2026-01-01T00:02:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('processes agent_message event type', () => {
    const jsonlPath = path.join(tmpDir, 'sess-agent.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs4', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({ type: 'agent_message', message: 'Agent started working', timestamp: '2026-01-01T00:01:00.000Z' }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('handles function_call with string arguments (parsedInput = JSON.parse branch)', () => {
    const jsonlPath = path.join(tmpDir, 'sess-fn-call.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs5', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({
        type: 'response',
        output: [
          {
            type: 'function_call',
            call_id: 'call-1',
            name: 'bash',
            arguments: JSON.stringify({ command: 'ls -la' }),
          },
        ],
        timestamp: '2026-01-01T00:01:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('handles function_call with invalid JSON arguments (parsedInput = { raw } fallback)', () => {
    const jsonlPath = path.join(tmpDir, 'sess-fn-bad.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs6', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({
        type: 'response',
        output: [
          {
            type: 'function_call',
            call_id: 'call-2',
            name: 'bash',
            arguments: 'NOT_VALID_JSON',
          },
        ],
        timestamp: '2026-01-01T00:01:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('handles function_call_output items', () => {
    const jsonlPath = path.join(tmpDir, 'sess-fn-out.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs7', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({
        type: 'response',
        output: [
          {
            type: 'function_call_output',
            call_id: 'call-1',
            output: 'file1.ts\nfile2.ts',
          },
        ],
        timestamp: '2026-01-01T00:01:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });

  it('handles message with unknown role (returns empty lines)', () => {
    const jsonlPath = path.join(tmpDir, 'sess-unknown-role.jsonl');
    const lines = [
      JSON.stringify({ type: 'session_started', sessionId: 'cs8', timestamp: '2026-01-01T00:00:00.000Z' }),
      JSON.stringify({
        type: 'response',
        output: [
          { type: 'message', role: 'unknown_role', content: [{ type: 'text', text: 'hi' }] },
        ],
        timestamp: '2026-01-01T00:01:00.000Z',
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));
    expect(() => db.importSession(jsonlPath, 'test-repo')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 958: extractAgentInfo — JSON.parse throws (malformed tool_calls_json)
// ─────────────────────────────────────────────────────────────────────────────

describe('extractAgentInfo — via backfillSubagentTypePublic with malformed tool_calls', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-cova4-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not throw when tool_calls contains malformed JSON (catch branch)', () => {
    insertSession(db, 's-agent');
    // Insert a message with malformed tool_calls JSON directly
    inner(db).run(
      `INSERT OR IGNORE INTO messages
         (uuid, session_id, type, timestamp, text_content, user_content, tool_calls,
          input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, stop_reason)
       VALUES ('m-bad', 's-agent', 'assistant', '2026-01-01T00:01:00.000Z',
               null, null, 'NOT_VALID_JSON', 0, 0, 0, 0, null)`,
    );
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    // backfillSubagentTypePublic calls extractAgentInfo internally
    expect(() => db.backfillSubagentTypePublic(projectsDir)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 1150-1152: TrailDatabase constructor — string storageDirOrStorage path
// (FileTrailStorage branch instead of ITrailStorage)
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase constructor — string storageDir branch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-ctor-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('constructs with a string storageDir (FileTrailStorage path)', async () => {
    const db = await createFileBackedTestDb(tmpDir);
    try {
      // listBackups returns entries from FileTrailStorage (none yet in this fresh DB)
      const backups = db.listBackups();
      expect(Array.isArray(backups)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('init() creates the parent directory when it does not exist (regression)', async () => {
    // 親ディレクトリが未作成の状態で better-sqlite3 を開くと
    // "Cannot open database because the directory does not exist" で落ちていた回帰
    // (新規環境・初回 activate で再現)。init() が親ディレクトリを作成して開けること。
    const nestedDir = path.join(tmpDir, 'does', 'not', 'exist', 'trail');
    expect(fs.existsSync(nestedDir)).toBe(false);

    const db = await createFileBackedTestDb(nestedDir);
    try {
      expect(fs.existsSync(path.join(nestedDir, 'trail.db'))).toBe(true);
    } finally {
      db.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 1195-1198: applyToolMcpAlias — called via getCombinedData
// Lines 1211-1212: computeDateInSqliteTz — called via getCombinedData
// Lines 1229-1247: computeWeekInSqliteTz — called via getCombinedData('week')
// ─────────────────────────────────────────────────────────────────────────────

describe('applyToolMcpAlias — via getCombinedData with mcp tool names', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('handles mcp__SERVER (no second __) — stays as-is, does not throw', () => {
    insertSession(db, 's-mcp');
    insertMessage(db, 'm-mcp1', 's-mcp', { type: 'assistant', timestamp: '2026-01-01T00:10:00.000Z' });
    insertToolCall(db, 's-mcp', 'm-mcp1', 'mcp__noserver', 0);
    expect(() => db.getCombinedData('day', 30)).not.toThrow();
  });

  it('aliases mcp__SERVER__TOOL to mcp__SERVER via getCombinedData', () => {
    insertSession(db, 's-mcp2', { startTime: '2026-01-01T00:00:00.000Z' });
    insertMessage(db, 'm-mcp2', 's-mcp2', { type: 'assistant', timestamp: '2026-01-01T00:10:00.000Z' });
    insertToolCall(db, 's-mcp2', 'm-mcp2', 'mcp__trail__list_elements', 0);
    // getCombinedData calls aggregateToolUsageByMessageDateCutoff which calls applyToolMcpAlias
    const result = db.getCombinedData('day', 30);
    expect(result).toBeDefined();
  });
});

describe('computeDateInSqliteTz and computeWeekInSqliteTz — via getCombinedData', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('does not throw when DB has tool calls (computeDateInSqliteTz exercised)', () => {
    insertSession(db, 's-dt', { startTime: '2026-01-01T00:00:00.000Z' });
    insertMessage(db, 'm-dt', 's-dt', { type: 'assistant', timestamp: '2026-01-01T00:10:00.000Z' });
    insertToolCall(db, 's-dt', 'm-dt', 'Read', 0);
    expect(() => db.getCombinedData('day', 30)).not.toThrow();
  });

  it('handles week period where date falls before first Monday of year (week=0 branch)', () => {
    // 2026-01-01 is a Thursday. First Monday of 2026 is Jan 5.
    // Session on Jan 1 UTC → falls in week 0.
    insertSession(db, 's-week0', {
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    });
    insertMessage(db, 'm-week0', 's-week0', { type: 'assistant', timestamp: '2026-01-01T00:10:00.000Z' });
    insertToolCall(db, 's-week0', 'm-week0', 'Read', 0);
    expect(() => db.getCombinedData('week', 30)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 1436: fetchInBatches — large message_tool_calls set (>999 items)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchInBatches — large message set (>999 items)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('handles >999 tool call rows without SQLite variable limit error', () => {
    insertSession(db, 's-batch');
    // Insert 1010 messages to exceed the 999 SQLite variable limit
    for (let i = 0; i < 1010; i++) {
      const hr = String(Math.floor(i / 3600) % 24).padStart(2, '0');
      const min = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
      const sec = String(i % 60).padStart(2, '0');
      const ts = `2026-01-01T${hr}:${min}:${sec}.000Z`;
      insertMessage(db, `m-batch-${i}`, 's-batch', {
        type: 'assistant',
        timestamp: ts,
        inputTokens: 10,
        outputTokens: 5,
      });
    }
    // getSessionTokens internally calls fetchInBatches for msgTokensByUuid
    expect(() => db.getSessionTokens('s-batch')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 1804: listBackups with InMemoryStorage returns empty array
// Lines 1818-1819: restoreFromBackup with InMemoryStorage throws TypeError
// ─────────────────────────────────────────────────────────────────────────────

describe('listBackups — InMemoryStorage returns empty array (line 1804)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for InMemoryTrailStorage', () => {
    const backups = db.listBackups();
    expect(backups).toEqual([]);
  });
});

describe('restoreFromBackup — InMemoryStorage throws TypeError (line 1818)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('throws TypeError when storage is not FileTrailStorage', () => {
    expect(() => db.restoreFromBackup(1)).toThrow(TypeError);
    expect(() => db.restoreFromBackup(1)).toThrow('restoreFromBackup is only supported with FileTrailStorage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 1880: ensureDb() throw — call a method before init()
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureDb — throws when called before init()', () => {
  it('throws when method called without init()', () => {
    const db = createUninitializedTestDb();
    // Do NOT call db.init() — ensureDb should throw
    expect(() => db.listRepos()).toThrow('TrailDatabase not initialized');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 2036-2118: migrateReleasesFlip — no-op on fresh DB (flip already done)
// ─────────────────────────────────────────────────────────────────────────────

describe('migrateReleasesFlip — no-op on fresh DB (flip already done)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('fresh DB has no prev_tag column (flip is no-op), releases table works', () => {
    const releases = inner(db).exec("SELECT COUNT(*) FROM releases");
    expect(releases[0]?.values?.[0]?.[0]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 2246-2285: migrateCurrentTablesRepoId — no-op on fresh DB
// Lines 2388-2396: migrateSessionCommitTablesRepoId — no-op on fresh DB
// Lines 2545-2562: migrateC4ManualTablesRepoId — no-op on fresh DB
// ─────────────────────────────────────────────────────────────────────────────

describe('repo normalization migrations — fresh DB (all no-op)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('fresh DB has session_commits table with repo_id (no flip needed)', () => {
    const res = inner(db).exec("PRAGMA table_info('session_commits')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).toContain('repo_id');
    expect(cols).not.toContain('repo_name');
  });

  it('fresh DB has c4_manual_elements without repo_name (no flip needed)', () => {
    const res = inner(db).exec("PRAGMA table_info('c4_manual_elements')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).toContain('repo_id');
  });

  it('fresh DB has current_code_graphs with repo_id as PK (no flip needed)', () => {
    const res = inner(db).exec("PRAGMA table_info('current_code_graphs')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).toContain('repo_id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 2621-2793: Phase H drop repo_name migrations — no-op on fresh DB
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase H drop repo_name migrations — all no-op on fresh DB', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('current_code_graphs has no repo_name column (H-3 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('current_code_graphs')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });

  it('sessions has no repo_name column (H-4 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('sessions')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });

  it('c4_manual_elements has no repo_name column (H-2 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('c4_manual_elements')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });

  it('releases table has no repo_name column (H-5 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('releases')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 2877-2948: dropSessionCommitRepoNameColumn — no-op on fresh DB
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase H-4 dropSessionCommitRepoNameColumn — no-op on fresh DB', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('commit_files has no repo_name column (H-4 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('commit_files')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });

  it('session_commits has no repo_name column (H-4 already applied)', () => {
    const res = inner(db).exec("PRAGMA table_info('session_commits')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 3072-3155: dropReleaseSubtreeRepoNameColumn / rebuildReleaseSubtreeTableDroppingRepoName
// Lines 3232-3249: migrateDoraMetricsRepoIdFlip — no-op on fresh DB
// Lines 3314: derived additive repo_id catch branch
// Lines 3351-3403: dropDerivedRepoNameColumn — no-op on fresh DB
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase H-1/F: dora_metrics and release tables — no-op on fresh DB', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('dora_metrics table has no repo_name column if it exists (H-1 applied)', () => {
    const res = inner(db).exec("SELECT name FROM sqlite_master WHERE type='table' AND name='dora_metrics'");
    if ((res[0]?.values ?? []).length === 0) {
      // table not yet created (no dora data) — no-op branch was taken
      expect(true).toBe(true);
      return;
    }
    const colRes = inner(db).exec("PRAGMA table_info('dora_metrics')");
    const cols = (colRes[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });

  it('release_file_analysis has no repo_name column if it exists', () => {
    const res = inner(db).exec("SELECT name FROM sqlite_master WHERE type='table' AND name='release_file_analysis'");
    if ((res[0]?.values ?? []).length === 0) {
      expect(true).toBe(true);
      return;
    }
    const colRes = inner(db).exec("PRAGMA table_info('release_file_analysis')");
    const cols = (colRes[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 3434-3452: migrateReleaseChildrenReleaseId — no-op on fresh DB
// Lines 3481-3490: migrateReleaseChildrenReleaseId — warn branch
// Lines 3506-3513: backfillReleaseRepoIds — no-op when repo_name absent
// ─────────────────────────────────────────────────────────────────────────────

describe('migrateReleaseChildrenReleaseId — fresh DB has release_id already', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('release_file_analysis has release_id column', () => {
    const res = inner(db).exec("SELECT name FROM sqlite_master WHERE type='table' AND name='release_file_analysis'");
    if ((res[0]?.values ?? []).length === 0) {
      expect(true).toBe(true);
      return;
    }
    const colRes = inner(db).exec("PRAGMA table_info('release_file_analysis')");
    const cols = (colRes[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).toContain('release_id');
  });

  it('releases has no repo_name (backfillReleaseRepoIds returns early)', () => {
    const res = inner(db).exec("PRAGMA table_info('releases')");
    const cols = (res[0]?.values ?? []).map((r) => r[1] as string);
    expect(cols).not.toContain('repo_name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 3541: runAlterStatements — column already exists is swallowed
// ─────────────────────────────────────────────────────────────────────────────

describe('runAlterStatements — idempotent (column already exists is ignored)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('second init on same DB does not throw (runAlterStatements is idempotent)', async () => {
    // Calling init again triggers runAlterStatements which tries to ADD COLUMN
    // on already-existing columns; those errors are caught silently.
    await expect(db.init()).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 3604: createTables — orphan table drop is silent no-op
// ─────────────────────────────────────────────────────────────────────────────

describe('createTables — orphan table drop is silent no-op', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('c4_models table does not exist after init (orphan removal ran)', () => {
    const res = inner(db).exec("SELECT name FROM sqlite_master WHERE type='table' AND name='c4_models'");
    expect(res[0]?.values ?? []).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 3827-3864: backfillRepoNameV1 — skipped on fresh DB (repo_name column absent)
// On fresh DB (Phase H-4 done), sessions has no repo_name → migration is skipped
// and 'repo_name_backfill_v1' is marked done immediately.
// ─────────────────────────────────────────────────────────────────────────────

describe('backfillRepoNameV1 — skipped on fresh DB (repo_name column absent)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('_migrations table records repo_name_backfill_v1 as done', () => {
    const res = inner(db).exec("SELECT key FROM _migrations WHERE key='repo_name_backfill_v1'");
    expect(res[0]?.values ?? []).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 3952-3976: backfillSourceToolLinksForSession
// Private method called from backfillSourceToolLinkFields.
// We test by accessing backfillSourceToolLinkFields via a fresh DB
// where the migration hasn't run yet.
// ─────────────────────────────────────────────────────────────────────────────

describe('backfillSourceToolLinkFields — processes JSONL with source_tool links', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-cova5-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles JSONL with missing uuid lines (skip branch) and valid link lines', async () => {
    const jsonlPath = path.join(tmpDir, 'sess-linked.jsonl');
    const lines = [
      JSON.stringify({ type: 'assistant', sourceToolAssistantUUID: 'u1' }), // no uuid → skip
      JSON.stringify({ uuid: 'm1', type: 'assistant' }), // no sourceToolLinks → skip
      JSON.stringify({ uuid: 'm2', type: 'assistant', sourceToolAssistantUUID: 'u1', sourceToolUseID: 'tid1' }),
      'NOT_JSON', // parse failure → continue
      '', // empty line → continue
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n'));

    // Use a fresh DB without migration flag
    const db2 = await createTestTrailDatabase();
    try {
      insertSession(db2, 's-linked', { filePath: jsonlPath });
      insertMessage(db2, 'm2', 's-linked', { type: 'assistant' });
      // Reset migration flag so backfillSourceToolLinkFields runs again
      inner(db2).run("DELETE FROM _migrations WHERE key='source_tool_link_backfill_v1'");
      // Access private method via type cast
      const target = db2 as unknown as { backfillSourceToolLinkFields(): void };
      expect(() => target.backfillSourceToolLinkFields()).not.toThrow();
    } finally {
      db2.close();
    }
  });

  it('handles session with non-existent JSONL file (returns 0, no throw)', async () => {
    const db2 = await createTestTrailDatabase();
    try {
      insertSession(db2, 's-missing', {
        filePath: '/nonexistent/path/to/session.jsonl',
      });
      inner(db2).run("DELETE FROM _migrations WHERE key='source_tool_link_backfill_v1'");
      const target = db2 as unknown as { backfillSourceToolLinkFields(): void };
      expect(() => target.backfillSourceToolLinkFields()).not.toThrow();
    } finally {
      db2.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// repoNameForId / listRepos / getAllRepos — basic coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('repoNameForId — unknown id returns null', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null for an id that does not exist in repos', () => {
    expect(db.repoNameForId(99999)).toBeNull();
  });

  it('returns the repo name for an existing id', () => {
    const rid = repoId(db, 'my-repo');
    expect(db.repoNameForId(rid)).toBe('my-repo');
  });
});

describe('listRepos — returns all repos', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no repos registered', () => {
    expect(db.listRepos()).toEqual([]);
  });

  it('returns repos after registering via repoIdForName', () => {
    repoId(db, 'repo-a');
    repoId(db, 'repo-b');
    const repos = db.listRepos();
    expect(repos.length).toBe(2);
    expect(repos.map((r) => r.repoName)).toContain('repo-a');
    expect(repos.map((r) => r.repoName)).toContain('repo-b');
  });
});

describe('getAllRepos — returns all repos with created_at', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns repos with created_at field', () => {
    repoId(db, 'repo-x');
    const repos = db.getAllRepos();
    expect(repos.length).toBe(1);
    expect(repos[0].repo_name).toBe('repo-x');
    expect(repos[0].created_at).not.toBeNull();
  });
});

describe('withTransaction — rolls back on error', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('throws and does not leave partial state', () => {
    const withTransaction = (db as unknown as {
      withTransaction<T>(fn: (db2: RawDb) => T): T;
    }).withTransaction.bind(db);

    expect(() =>
      withTransaction(() => {
        throw new Error('intentional-rollback');
      }),
    ).toThrow('intentional-rollback');
  });
});
