// __non_webpack_require__ はwebpackグローバル。テスト環境ではsql-asm.jsを直接ロードするよう差し替え
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

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
      `INSERT INTO sessions (id, slug, project, version, entrypoint, model,
         start_time, end_time, message_count, file_path, file_size, imported_at)
       VALUES ('broken-sid','','','','','','','',10,'/tmp/broken.jsonl',123,'')`,
    );
    // Healthy session with matching messages.
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, project, version, entrypoint, model,
         start_time, end_time, message_count, file_path, file_size, imported_at)
       VALUES ('ok-sid','','','','','','','',1,'/tmp/ok.jsonl',456,'')`,
    );
    inMemoryDb.run(
      `INSERT INTO messages (uuid, session_id, type, timestamp)
       VALUES ('u1','ok-sid','assistant','2026-04-12T00:00:00Z')`,
    );
    // Empty-log session (message_count=0) is considered healthy — nothing to reimport.
    inMemoryDb.run(
      `INSERT INTO sessions (id, slug, project, version, entrypoint, model,
         start_time, end_time, message_count, file_path, file_size, imported_at)
       VALUES ('empty-sid','','','','','','','',0,'/tmp/empty.jsonl',789,'')`,
    );

    const map = (db as unknown as Record<string, () => Map<string, { hasMessages: boolean }>>).getImportedFileMap();
    expect(map.get('/tmp/broken.jsonl')?.hasMessages).toBe(false);
    expect(map.get('/tmp/ok.jsonl')?.hasMessages).toBe(true);
    expect(map.get('/tmp/empty.jsonl')?.hasMessages).toBe(true);
    db.close();
  });
});

describe('TrailDatabase.getDayToolMetrics', () => {
  it('aggregates tool/skill/error/model rows for the given date', async () => {
    const db = await createTestTrailDatabase();
    const inMemoryDb = (db as unknown as Record<string, unknown>).db as import('sql.js').Database;

    const insert = (date: string, kind: string, key: string, count: number, tokens: number, durationMs: number) => {
      inMemoryDb.run(
        `INSERT INTO daily_counts (date, kind, key, count, tokens, duration_ms) VALUES (?, ?, ?, ?, ?, ?)`,
        [date, kind, key, count, tokens, durationMs],
      );
    };
    // Target date rows
    insert('2026-04-25', 'tool', 'Bash', 10, 1000, 5000);
    insert('2026-04-25', 'tool', 'Read', 3, 200, 100);
    insert('2026-04-25', 'skill', 'design-md', 2, 0, 0);
    insert('2026-04-25', 'error', 'Bash', 4, 0, 0);
    insert('2026-04-25', 'model', 'claude-opus-4-7', 5, 50000, 0);
    // Other-date row should be ignored
    insert('2026-04-24', 'tool', 'Bash', 99, 9999, 9999);

    const result = db.getDayToolMetrics('2026-04-25');
    expect(result).not.toBeNull();
    expect(result!.toolUsage).toEqual([
      { tool: 'Bash', count: 10, tokens: 1000, durationMs: 5000 },
      { tool: 'Read', count: 3, tokens: 200, durationMs: 100 },
    ]);
    expect(result!.skillUsage).toEqual([{ skill: 'design-md', count: 2, tokens: 0, durationMs: 0 }]);
    expect(result!.errorsByTool).toEqual([{ tool: 'Bash', count: 4 }]);
    expect(result!.modelUsage).toEqual([{ model: 'claude-opus-4-7', count: 5, tokens: 50000, durationMs: 0 }]);
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
