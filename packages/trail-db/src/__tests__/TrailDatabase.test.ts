
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { codexMessageUuid } from '../codexMessageUuid';
import { TrailDatabase, estimateCost, INSERT_MESSAGE } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

describe('estimateCost', () => {
  it('should calculate sonnet cost with all 4 token types', () => {
    // input: 1M, output: 1M, cacheRead: 1M, cacheCreation: 1M
    // cost = (1M * 3 + 1M * 15 + 1M * 0.3 + 1M * 3.75) / 1M = $22.05
    const result = estimateCost('claude-sonnet-4-6', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(22.05);
  });

  it('should calculate opus cost with model-specific rates', () => {
    const result = estimateCost('claude-opus-4-6', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(110.25); // 15 + 75 + 1.5 + 18.75
  });

  it('should calculate haiku cost with model-specific rates', () => {
    const result = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(5.88); // 0.8 + 4 + 0.08 + 1.0
  });

  it('should fallback to sonnet rates for unknown models', () => {
    const result = estimateCost('unknown-model', 1_000_000, 0, 0, 0);
    expect(result).toBeCloseTo(3.0);
  });

  it('should match opus by partial name', () => {
    const result = estimateCost('some-opus-variant', 1_000_000, 0, 0, 0);
    expect(result).toBeCloseTo(15.0);
  });

  it('should use Codex pricing when the session source is codex', () => {
    const result = estimateCost('', 1_000_000, 1_000_000, 1_000_000, 1_000_000, 'codex');
    expect(result).toBeCloseTo(12.625);
  });
});

describe('TrailDatabase.parseSessionIdFromBody', () => {
  let db: TrailDatabase;

  beforeAll(async () => {
    db = await createTestTrailDatabase();
  });

  afterAll(() => {
    db.close();
  });

  const parse = (body: string): string | null =>
    (db as unknown as Record<string, (b: string) => string | null>).parseSessionIdFromBody(body);

  it('正常な UUID を抽出する', () => {
    expect(parse('Session-Id: 550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('大文字小文字を区別しない', () => {
    expect(parse('session-id: 550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('複数トレーラーから Session-Id を抽出する', () => {
    const body = [
      'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
      'Session-Id: abcdef01-2345-6789-abcd-ef0123456789',
    ].join('\n');
    expect(parse(body)).toBe('abcdef01-2345-6789-abcd-ef0123456789');
  });

  it('Session-Id がない場合は null を返す', () => {
    expect(parse('Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>')).toBeNull();
  });

  it('不正な形式は null を返す', () => {
    expect(parse('Session-Id: not-a-uuid')).toBeNull();
  });

  it('行頭でない場合は null を返す', () => {
    expect(parse('  Session-Id: 550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  it('空文字列は null を返す', () => {
    expect(parse('')).toBeNull();
  });
});

describe('INSERT_MESSAGE statement', () => {
  it('has matching column count and placeholder count', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    // If the column list and placeholder count disagree, prepare() throws.
    // This guards against "N values for M columns" regressions.
    const stmt = inMemoryDb.prepare(INSERT_MESSAGE);
    stmt.free();
    db.close();
  });
});

describe('TrailDatabase.getImportedFileMap', () => {
  it('flags hasMessages=false for sessions with message_count>0 but no messages rows', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    // Broken session: row inserted but messages silently dropped by a prior bug.
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES ('broken-sid', '', '', '', '', '', '', 10, '/tmp/broken.jsonl', 123, '')`,
    );
    // Healthy session with matching messages.
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES ('ok-sid', '', '', '', '', '', '', 1, '/tmp/ok.jsonl', 456, '')`,
    );
    inMemoryDb.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp)
       VALUES ('u1','ok-sid','assistant','2026-04-12T00:00:00Z')`,
    );
    // Empty-log session (message_count=0) is considered healthy — nothing to reimport.
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES ('empty-sid', '', '', '', '', '', '', 0, '/tmp/empty.jsonl', 789, '')`,
    );

    const map = (db as unknown as Record<string, () => Map<string, { hasMessages: boolean }>>).getImportedFileMap();
    expect(map.get('/tmp/broken.jsonl')?.hasMessages).toBe(false);
    expect(map.get('/tmp/ok.jsonl')?.hasMessages).toBe(true);
    expect(map.get('/tmp/empty.jsonl')?.hasMessages).toBe(true);
    db.close();
  });

  it('flags imported Codex sessions with zero session costs for reimport', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('codex-zero', '', '', '', '', '', '', 2, '/tmp/codex-zero.jsonl', 123, '', 'codex')`,
    );
    inMemoryDb.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp)
       VALUES ('codex-zero-m1','codex-zero','assistant','2026-04-12T00:00:00Z')`,
    );
    inMemoryDb.run(
      `INSERT INTO session_costs
         (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
       VALUES ('codex-zero','',0,0,0,0,0)`,
    );

    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('codex-ok', '', '', '', '', '', '', 2, '/tmp/codex-ok.jsonl', 456, '', 'codex')`,
    );
    inMemoryDb.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp)
       VALUES ('codex-ok-m1','codex-ok','assistant','2026-04-12T00:00:00Z')`,
    );
    inMemoryDb.run(
      `INSERT INTO session_costs
         (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
       VALUES ('codex-ok','',100,20,50,0,0.001)`,
    );

    const map = (db as unknown as Record<string, () => Map<string, { hasUsableCostData: boolean }>>).getImportedFileMap();
    expect(map.get('/tmp/codex-zero.jsonl')?.hasUsableCostData).toBe(false);
    expect(map.get('/tmp/codex-ok.jsonl')?.hasUsableCostData).toBe(true);
    db.close();
  });
});

describe('TrailDatabase.migrateDropSessionsProjectColumn', () => {
  it('drops the legacy project column while preserving rows with foreign-key references', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    inMemoryDb.run('PRAGMA foreign_keys = OFF');
    inMemoryDb.run('DROP TABLE IF EXISTS session_costs');
    inMemoryDb.run('DROP TABLE IF EXISTS sessions');
    inMemoryDb.run(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      repo_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      entrypoint TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT '',
      commits_resolved_at TEXT,
      peak_context_tokens INTEGER,
      initial_context_tokens INTEGER,
      git_branch TEXT,
      interruption_reason TEXT,
      interruption_context_tokens INTEGER,
      message_commits_resolved_at TEXT,
      source TEXT NOT NULL DEFAULT 'claude_code',
      compact_count INTEGER
    )`);
    inMemoryDb.run(`CREATE TABLE session_costs (
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, model),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )`);
    inMemoryDb.run('PRAGMA foreign_keys = ON');
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, project, repo_name, start_time, end_time, file_path, imported_at) VALUES ('s1', 'slug', 'legacy-project', 'repo', '2026-04-29T00:00:00.000Z', '2026-04-29T00:00:01.000Z', '/tmp/s1.jsonl', '2026-04-29T00:00:02.000Z')`,
    );
    inMemoryDb.run(
      `INSERT INTO session_costs (session_id, model, input_tokens, output_tokens)
       VALUES ('s1', 'sonnet', 10, 2)`,
    );

    (db as unknown as Record<string, (inner: import('sql.js').Database) => void>).migrateDropSessionsProjectColumn(inMemoryDb);

    const cols = inMemoryDb.exec('PRAGMA table_info(sessions)')[0]?.values.map((r) => String(r[1])) ?? [];
    expect(cols).not.toContain('project');
    expect(cols).toContain('repo_name');
    expect(inMemoryDb.exec(`SELECT repo_name FROM sessions WHERE id = 's1'`)[0]?.values[0]?.[0]).toBe('repo');
    expect(inMemoryDb.exec(`SELECT input_tokens FROM session_costs WHERE session_id = 's1'`)[0]?.values[0]?.[0]).toBe(10);
    expect(Number(inMemoryDb.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0] ?? 0)).toBe(1);

    db.close();
  });
});

describe('TrailDatabase releases schema', () => {
  it('includes total_lines column', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;
    const result = inMemoryDb.exec('PRAGMA table_info(releases)');
    const columns = (result[0]?.values ?? []).map((row) => String(row[1] ?? ''));
    expect(columns).toContain('total_lines');
    db.close();
  });
});

describe('TrailDatabase.importSession - Codex token usage', () => {
  it('attaches token_count usage to the latest assistant message even after tool output', async () => {
    const db = await createTestTrailDatabase();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-codex-token-'));
    const filePath = path.join(tmpDir, 'rollout-2026-04-29T00-00-00-test.jsonl');
    const lines = [
      {
        timestamp: '2026-04-29T00:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'codex-token-session', cli_version: '0.125.0' },
      },
      {
        timestamp: '2026-04-29T00:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: '{"cmd":"pwd"}',
        },
      },
      {
        timestamp: '2026-04-29T00:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '/repo',
        },
      },
      {
        timestamp: '2026-04-29T00:00:03.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 12,
            },
          },
        },
      },
    ];
    fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf-8');

    db.importSession(filePath, 'repo', false, false);
    (db as unknown as Record<string, () => void>).rebuildSessionCosts();

    const inner = (db as unknown as { db: import('sql.js').Database }).db;
    const messageUsage = inner.exec(
      `SELECT input_tokens, output_tokens, cache_read_tokens
       FROM messages
       WHERE session_id = 'codex-token-session' AND type = 'assistant'`,
    )[0]?.values[0];
    expect(messageUsage).toEqual([60, 12, 40]);

    const sessionCost = inner.exec(
      `SELECT model, input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd
       FROM session_costs
       WHERE session_id = 'codex-token-session'`,
    )[0]?.values[0];
    expect(sessionCost?.[0]).toBe('gpt-5.1-codex');
    expect(sessionCost?.slice(1, 4)).toEqual([60, 12, 40]);
    expect(Number(sessionCost?.[4] ?? 0)).toBeCloseTo(0.0002, 6);

    const execMs = (db as unknown as { getTurnExecMsBySession: (sessionId: string) => Map<string, number> })
      .getTurnExecMsBySession('codex-token-session');
    // uuid は採番規則をハードコードせずヘルパーから導出する（旧テストは `codex-0` を
    // 直書きしており、セッション横断で衝突する採番をテスト側が固定してしまっていた）。
    expect(execMs.get(codexMessageUuid('codex-token-session', 0))).toBe(1000);

    db.close();
  });
});

describe('TrailDatabase.rebuildDailyCounts', () => {
  it('merges rows that resolve to the same daily count key', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: import('sql.js').Database }).db;
    inner.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('codex-default', '', '', '', '', '2026-04-29T00:00:00Z', '2026-04-29T00:01:00Z', 1, '/tmp/codex-default.jsonl', 1, '', 'codex'),
         ('codex-explicit','','','','gpt-5.1-codex','2026-04-29T00:00:00Z','2026-04-29T00:01:00Z',1,'/tmp/codex-explicit.jsonl',1,'','codex')`,
    );
    inner.run(
      `INSERT INTO messages
         (uuid, session_id, type, model, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
       VALUES
         ('m-default','codex-default','assistant','','2026-04-29T00:00:10Z',10,20,30,0),
         ('m-explicit','codex-explicit','assistant','gpt-5.1-codex','2026-04-29T00:00:20Z',40,50,60,0)`,
    );

    (db as unknown as Record<string, () => void>).rebuildDailyCounts();

    const costRows = inner.exec(
      `SELECT key, input_tokens, output_tokens, cache_read_tokens
       FROM daily_counts
       WHERE kind = 'cost_actual'`,
    )[0]?.values;
    expect(costRows).toEqual([['gpt-5.1-codex', 50, 70, 90]]);

    const modelRows = inner.exec(
      `SELECT key, count, tokens
       FROM daily_counts
       WHERE kind = 'model'`,
    )[0]?.values;
    expect(modelRows).toEqual([['gpt-5.1-codex', 2, 120]]);

    db.close();
  });

  it('skips sessions with empty start_time without violating daily_counts CHECK', async () => {
    // Regression: JSONL に timestamp が一度も現れないセッションは start_time = '' で
    // INSERT され、DATE('') が NULL → JS String(null) === 'null' → daily_counts.date
    // の GLOB CHECK に違反していた (2026-05-10 v0.18.0 で報告)。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: import('sql.js').Database }).db;
    inner.run(
      `INSERT INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES ('s-empty', '', '', '', '', '', '', 1, '/tmp/empty.jsonl', 1, '', 'claude_code'),
         ('s-valid','','','','','2026-04-29T00:00:00Z','2026-04-29T00:01:00Z',1,'/tmp/valid.jsonl',1,'','claude_code')`,
    );
    inner.run(
      `INSERT INTO messages
         (uuid, session_id, type, model, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
       VALUES
         ('m-empty','s-empty','assistant','claude-opus-4-7','2026-04-29T00:00:10Z',10,20,30,0),
         ('m-valid','s-valid','assistant','claude-opus-4-7','2026-04-29T00:00:20Z',40,50,60,0)`,
    );
    inner.run(
      `INSERT INTO message_tool_calls
         (session_id, message_uuid, turn_index, call_index, tool_name, timestamp)
       VALUES
         ('s-empty','m-empty',0,0,'Bash','2026-04-29T00:00:11Z'),
         ('s-valid','m-valid',0,0,'Bash','2026-04-29T00:00:21Z')`,
    );

    expect(() => {
      (db as unknown as Record<string, () => void>).rebuildDailyCounts();
    }).not.toThrow();

    const dates = inner.exec(`SELECT DISTINCT date FROM daily_counts ORDER BY date`)[0]?.values ?? [];
    for (const [d] of dates) {
      expect(String(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(dates.map((r) => r[0])).toEqual(['2026-04-29']);

    db.close();
  });
});

describe('TrailDatabase.getDayToolMetrics', () => {
  it('aggregates tool/skill/error/model rows for the given date', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    // 仕様変更: 旧版は daily_counts (timestamp 基準) から集計していたが、
    // 現実装は sessions.start_time (+540 分 = JST) で範囲を取り、
    // message_tool_calls + messages から集計する。
    // target date 2026-04-25 (JST) ⇔ UTC 2026-04-24T15:00:00Z .. 2026-04-25T14:59:59Z
    // すべての session start_time を UTC 05:00 (JST 14:00) に揃える。
    const SESSION_UTC = '2026-04-25T05:00:00Z';
    const OTHER_UTC = '2026-04-24T05:00:00Z'; // JST 2026-04-24

    // セッション作成
    inMemoryDb.run(
      `INSERT INTO sessions (id, start_time, source) VALUES
         ('s-target', ?, 'claude_code'),
         ('s-other',  ?, 'claude_code')`,
      [SESSION_UTC, OTHER_UTC],
    );

    // assistant メッセージ（model + tokens を持つ）
    inMemoryDb.run(
      `INSERT INTO messages (uuid, session_id, type, model, timestamp, input_tokens, output_tokens)
       VALUES
         ('m-target-1', 's-target', 'assistant', 'claude-opus-4-7', ?, 30000, 20000),
         ('m-target-2', 's-target', 'assistant', 'claude-opus-4-7', ?, 0, 0),
         ('m-target-3', 's-target', 'assistant', 'claude-opus-4-7', ?, 0, 0),
         ('m-target-4', 's-target', 'assistant', 'claude-opus-4-7', ?, 0, 0),
         ('m-target-5', 's-target', 'assistant', 'claude-opus-4-7', ?, 0, 0),
         ('m-other',    's-other',  'assistant', 'claude-opus-4-7', ?, 99999, 0)`,
      [SESSION_UTC, SESSION_UTC, SESSION_UTC, SESSION_UTC, SESSION_UTC, OTHER_UTC],
    );

    // tool_calls: target 日に Bash×10, Read×3, さらに Bash の error×4。
    // skill は今回のスコープでは aggregateByDayInternal が skill_name IS NOT NULL を要求するため
    // 1 メッセージにつき 1 skill を紐付け。
    const bulkCall: string[] = [];
    const bulkParams: (string | number | null)[] = [];
    for (let i = 0; i < 10; i++) {
      bulkCall.push("(?, ?, 0, ?, 'Bash', ?, 0)");
      bulkParams.push('s-target', 'm-target-1', i, SESSION_UTC);
    }
    for (let i = 0; i < 3; i++) {
      bulkCall.push("(?, ?, 0, ?, 'Read', ?, 0)");
      bulkParams.push('s-target', 'm-target-2', 10 + i, SESSION_UTC);
    }
    for (let i = 0; i < 4; i++) {
      bulkCall.push("(?, ?, 0, ?, 'Bash', ?, 1)");
      bulkParams.push('s-target', 'm-target-3', 20 + i, SESSION_UTC);
    }
    // 他日のレコード — 除外されるべき
    bulkCall.push("(?, ?, 0, 0, 'Bash', ?, 0)");
    bulkParams.push('s-other', 'm-other', OTHER_UTC);

    inMemoryDb.run(
      `INSERT INTO message_tool_calls
         (session_id, message_uuid, turn_index, call_index, tool_name, timestamp, is_error)
       VALUES ${bulkCall.join(',')}`,
      bulkParams,
    );

    // skill: design-md に紐付く tool_call を 2 件
    inMemoryDb.run(
      `INSERT INTO message_tool_calls
         (session_id, message_uuid, turn_index, call_index, tool_name, skill_name, timestamp)
       VALUES
         ('s-target', 'm-target-4', 0, 100, 'Skill', 'design-md', ?),
         ('s-target', 'm-target-5', 0, 101, 'Skill', 'design-md', ?)`,
      [SESSION_UTC, SESSION_UTC],
    );

    const result = db.getDayToolMetrics('2026-04-25');
    expect(result).not.toBeNull();
    // tool 集計: Bash(error 含む 14), Read(3), Skill(2) のうち、count=DESC ソート
    const toolMap = new Map(result!.toolUsage.map((t) => [t.tool, t.count]));
    expect(toolMap.get('Bash')).toBe(14); // 10 + 4 errors も Bash として count される
    expect(toolMap.get('Read')).toBe(3);

    expect(result!.skillUsage[0].skill).toBe('design-md');
    expect(result!.skillUsage[0].count).toBe(2);

    expect(result!.errorsByTool).toEqual([{ tool: 'Bash', count: 4 }]);

    // model 名は resolvePricingModelName で正規化される（claude-opus-4-7 → 'opus'）。
    expect(result!.modelUsage[0].model).toMatch(/opus/i);
    expect(result!.modelUsage[0].count).toBe(5);
    expect(result!.modelUsage[0].tokens).toBe(50000);
    db.close();
  });

  it('returns empty arrays when no rows match the date', async () => {
    const db = await createTestTrailDatabase();
    const result = db.getDayToolMetrics('2026-04-25');
    expect(result).not.toBeNull();
    expect(result!.toolUsage).toEqual([]);
    expect(result!.skillUsage).toEqual([]);
    expect(result!.errorsByTool).toEqual([]);
    expect(result!.modelUsage).toEqual([]);
    db.close();
  });
});

describe('c4_manual_elements CRUD', () => {
  // Factory-only construction — see support/createTestDb.ts for safety rationale.
  const createDb = createTestTrailDatabase;

  it('inserts a manual element and reads it back', async () => {
    const db = await createDb();
    const id = db.saveManualElement('repo-a', {
      type: 'person', name: 'User', description: 'End user', external: false, parentId: null,
    });
    expect(id).toBe('person_1');
    const list = db.getManualElements('repo-a');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'person_1', type: 'person', name: 'User' });
    db.close();
  });

  it('allocates sequential ids by type', async () => {
    const db = await createDb();
    const a = db.saveManualElement('repo-a', { type: 'person', name: 'A', external: false, parentId: null });
    const b = db.saveManualElement('repo-a', { type: 'person', name: 'B', external: false, parentId: null });
    const c = db.saveManualElement('repo-a', { type: 'system', name: 'C', external: false, parentId: null });
    expect(a).toBe('person_1');
    expect(b).toBe('person_2');
    expect(c).toBe('sys_manual_1');
    db.close();
  });

  it('isolates by repo_name', async () => {
    const db = await createDb();
    db.saveManualElement('repo-a', { type: 'person', name: 'A', external: false, parentId: null });
    db.saveManualElement('repo-b', { type: 'person', name: 'B', external: false, parentId: null });
    expect(db.getManualElements('repo-a')).toHaveLength(1);
    expect(db.getManualElements('repo-b')).toHaveLength(1);
    db.close();
  });

  it('updates an existing manual element', async () => {
    const db = await createDb();
    const id = db.saveManualElement('repo-a', { type: 'person', name: 'Old', external: false, parentId: null });
    db.updateManualElement('repo-a', id, { name: 'New', description: 'desc', external: true });
    const list = db.getManualElements('repo-a');
    expect(list[0].name).toBe('New');
    expect(list[0].description).toBe('desc');
    expect(list[0].external).toBe(true);
    db.close();
  });

  it('deletes a manual element and cascades relationships', async () => {
    const db = await createDb();
    const a = db.saveManualElement('repo-a', { type: 'person', name: 'A', external: false, parentId: null });
    const b = db.saveManualElement('repo-a', { type: 'system', name: 'B', external: false, parentId: null });
    db.saveManualRelationship('repo-a', { fromId: a, toId: b });
    db.deleteManualElement('repo-a', a);
    expect(db.getManualElements('repo-a')).toHaveLength(1);
    expect(db.getManualRelationships('repo-a')).toHaveLength(0);
    db.close();
  });

  it('saves and reads serviceType', async () => {
    const db = await createDb();
    db.saveManualElement('repo', {
      type: 'container', name: 'Supabase', external: true, parentId: null,
      serviceType: 'supabase',
    });
    const elements = db.getManualElements('repo');
    expect(elements[0].serviceType).toBe('supabase');
    db.close();
  });

  it('updateManualElement updates serviceType', async () => {
    const db = await createDb();
    const id = db.saveManualElement('repo', {
      type: 'container', name: 'Supabase', external: true, parentId: null,
      serviceType: 'supabase',
    });
    db.updateManualElement('repo', id, { serviceType: 'netlify' });
    const elements = db.getManualElements('repo');
    expect(elements[0].serviceType).toBe('netlify');
    db.close();
  });
});

describe('TrailDatabase.getLastImportedAt', () => {
  it('セッションがない場合はnullを返す', async () => {
    const db = await createTestTrailDatabase();
    const result = db.getLastImportedAt();
    expect(result).toBeNull();
    db.close();
  });
});
