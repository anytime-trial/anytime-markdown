import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { parseReviewSessions } from '../../../src/ingest/review/parseReviewSession';

// ── Helpers ───────────────────────────────────────────────────────────────────

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

/**
 * Create a minimal memory-core main DB (no migrations needed — we just need
 * the attach guard to work, which requires memory_failed_items table).
 */
function makeMainDb(): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS memory_failed_items (
      scope TEXT NOT NULL,
      item_key TEXT NOT NULL,
      failed_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      detail TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (scope, item_key)
    )
  `);
  return db;
}

/**
 * Create an in-memory trail DB with just the messages table.
 */
function makeTrailDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text_content TEXT,
      tool_calls TEXT,
      subagent_type TEXT,
      skill TEXT
    )
  `);
  return db;
}

type InsertMsgOpts = {
  uuid: string;
  session_id: string;
  type?: string;
  timestamp: string;
  text_content?: string;
  tool_calls?: string | null;
  subagent_type?: string | null;
  skill?: string | null;
};

function insertMsg(trailDb: Database, opts: InsertMsgOpts): void {
  trailDb.run(
    `INSERT INTO messages
      (uuid, session_id, type, timestamp, text_content, tool_calls, subagent_type, skill)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.uuid,
      opts.session_id,
      opts.type ?? 'user',
      opts.timestamp,
      opts.text_content ?? null,
      opts.tool_calls ?? null,
      opts.subagent_type ?? null,
      opts.skill ?? null,
    ],
  );
}

const silentLogger = { warn: (_msg: string) => {} };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseReviewSessions', () => {
  // Test 1: empty DB → []
  test('returns [] when no matching messages', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toEqual([]);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 2: one session with 2 code-reviewer messages → 1 ParsedReviewSession
  test('groups 2 messages in one session into 1 review session', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'uuid-1',
      session_id: 'sess-a',
      type: 'user',
      timestamp: '2026-03-01T10:00:00.000Z',
      text_content: 'レビューをお願いします',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'uuid-2',
      session_id: 'sess-a',
      type: 'assistant',
      timestamp: '2026-03-01T10:01:00.000Z',
      text_content: 'レビュー結果です',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 3: message_uuid_start = first msg, message_uuid_end = last msg
  test('sets message_uuid_start and message_uuid_end correctly', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'first-uuid',
      session_id: 'sess-b',
      type: 'user',
      timestamp: '2026-03-02T08:00:00.000Z',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'last-uuid',
      session_id: 'sess-b',
      type: 'assistant',
      timestamp: '2026-03-02T08:05:00.000Z',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].message_uuid_start).toBe('first-uuid');
    expect(results[0].message_uuid_end).toBe('last-uuid');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 4: reviewed_at = first message timestamp
  test('sets reviewed_at to the first message timestamp', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'ts-uuid-1',
      session_id: 'sess-c',
      type: 'user',
      timestamp: '2026-04-10T12:00:00.000Z',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'ts-uuid-2',
      session_id: 'sess-c',
      type: 'assistant',
      timestamp: '2026-04-10T12:10:00.000Z',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].reviewed_at).toBe('2026-04-10T12:00:00.000Z');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 5: two separate sessions → 2 ParsedReviewSessions
  test('returns 2 results for 2 different sessions', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'sess1-msg1',
      session_id: 'session-1',
      type: 'user',
      timestamp: '2026-03-05T09:00:00.000Z',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'sess2-msg1',
      session_id: 'session-2',
      type: 'user',
      timestamp: '2026-03-05T10:00:00.000Z',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(2);
    const sessionIds = results.map((r) => r.session_id).sort();
    expect(sessionIds).toEqual(['session-1', 'session-2']);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 6: messages with skill='superpowers:requesting-code-review' are captured
  test('captures messages with skill=superpowers:requesting-code-review', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'skill-uuid-1',
      session_id: 'sess-skill',
      type: 'user',
      timestamp: '2026-03-10T14:00:00.000Z',
      skill: 'superpowers:requesting-code-review',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].session_id).toBe('sess-skill');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 7: messages before sinceISO are filtered out
  test('filters out messages before sinceISO', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    // Old message — should be excluded
    insertMsg(trailDb, {
      uuid: 'old-uuid',
      session_id: 'sess-old',
      type: 'user',
      timestamp: '2025-12-31T23:59:59.000Z',
      subagent_type: 'code-reviewer',
    });

    // New message — should be included
    insertMsg(trailDb, {
      uuid: 'new-uuid',
      session_id: 'sess-new',
      type: 'user',
      timestamp: '2026-02-01T00:00:00.000Z',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].session_id).toBe('sess-new');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 8: tool_calls with input.prompt containing backtick paths → target_refs
  test('extracts target_refs from tool_calls input.prompt backtick paths', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const toolCalls = JSON.stringify([
      {
        input: {
          prompt: 'Please review `packages/web-app/src/index.ts` and `packages/trail-viewer/src/App.tsx`',
        },
      },
    ]);

    insertMsg(trailDb, {
      uuid: 'tc-uuid-1',
      session_id: 'sess-tc',
      type: 'user',
      timestamp: '2026-04-01T10:00:00.000Z',
      subagent_type: 'code-reviewer',
      tool_calls: toolCalls,
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].target_refs).toContain('packages/web-app/src/index.ts');
    expect(results[0].target_refs).toContain('packages/trail-viewer/src/App.tsx');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 9: body_excerpt truncated to 4096 chars when content exceeds it
  test('truncates body_excerpt to 4096 chars', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    // Each message has 2048-char excerpt (the SQL SUBSTR limit), plus 5-char separator '\n---\n'
    // 3 messages × 2048 + 2 × 5 = 6144 + 10 = 6154 chars > 4096
    const longText = 'A'.repeat(2048);

    insertMsg(trailDb, {
      uuid: 'long-1',
      session_id: 'sess-long',
      type: 'user',
      timestamp: '2026-04-15T10:00:00.000Z',
      text_content: longText,
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'long-2',
      session_id: 'sess-long',
      type: 'assistant',
      timestamp: '2026-04-15T10:01:00.000Z',
      text_content: longText,
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'long-3',
      session_id: 'sess-long',
      type: 'assistant',
      timestamp: '2026-04-15T10:02:00.000Z',
      text_content: longText,
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].body_excerpt.length).toBe(4096);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: target_kind=spec when all refs start with spec/
  test('infers target_kind=spec when all refs are under spec/', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const toolCalls = JSON.stringify([
      { input: { prompt: 'Review `spec/12.design/design.md`' } },
    ]);

    insertMsg(trailDb, {
      uuid: 'spec-uuid-1',
      session_id: 'sess-spec',
      type: 'user',
      timestamp: '2026-04-20T09:00:00.000Z',
      subagent_type: 'code-reviewer',
      tool_calls: toolCalls,
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_kind).toBe('spec');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: target_kind=code when all refs start with packages/
  test('infers target_kind=code when all refs are under packages/', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const toolCalls = JSON.stringify([
      { input: { prompt: 'Review `packages/memory-core/src/index.ts`' } },
    ]);

    insertMsg(trailDb, {
      uuid: 'code-uuid-1',
      session_id: 'sess-code',
      type: 'user',
      timestamp: '2026-04-21T09:00:00.000Z',
      subagent_type: 'code-reviewer',
      tool_calls: toolCalls,
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_kind).toBe('code');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: findings extracted from body_excerpt with **問題:** patterns
  test('extracts findings from body_excerpt with **問題:** and **提案:** patterns', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const reviewText = `## セキュリティ

**問題:** XSS 脆弱性がある。

**提案:** DOMPurify を適用する。
`;

    insertMsg(trailDb, {
      uuid: 'finding-uuid-1',
      session_id: 'sess-finding',
      type: 'assistant',
      timestamp: '2026-04-25T11:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].findings).toHaveLength(1);
    expect(results[0].findings[0].category).toBe('security');
    expect(results[0].findings[0].finding_text).toContain('XSS 脆弱性がある');
    expect(results[0].findings[0].suggestion_text).toContain('DOMPurify');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: reviewer is 'unknown' (default)
  test('sets reviewer to unknown', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'rev-uuid-1',
      session_id: 'sess-rev',
      type: 'user',
      timestamp: '2026-05-01T10:00:00.000Z',
      subagent_type: 'superpowers:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].reviewer).toBe('unknown');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: subagent_invocation_id is null
  test('sets subagent_invocation_id to null', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'inv-uuid-1',
      session_id: 'sess-inv',
      type: 'user',
      timestamp: '2026-05-02T10:00:00.000Z',
      skill: 'code-review-checklist',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].subagent_invocation_id).toBeNull();

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: tool_calls with input.file_path and input.path extracted
  test('extracts target_refs from tool_calls input.file_path and input.path', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const toolCalls = JSON.stringify([
      { input: { file_path: 'packages/web-app/src/pages/index.tsx' } },
      { input: { path: 'packages/memory-core/src/db/connection.ts' } },
    ]);

    insertMsg(trailDb, {
      uuid: 'fp-uuid-1',
      session_id: 'sess-fp',
      type: 'user',
      timestamp: '2026-05-03T10:00:00.000Z',
      subagent_type: 'code-reviewer',
      tool_calls: toolCalls,
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_refs).toContain('packages/web-app/src/pages/index.tsx');
    expect(results[0].target_refs).toContain('packages/memory-core/src/db/connection.ts');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Additional: backtick paths in user message text_excerpt also extracted
  test('extracts target_refs from backtick paths in user message text_excerpt', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'text-ref-uuid',
      session_id: 'sess-text-ref',
      type: 'user',
      timestamp: '2026-05-04T10:00:00.000Z',
      text_content: 'Please review `packages/trail-viewer/src/components/App.tsx` for issues.',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_refs).toContain('packages/trail-viewer/src/components/App.tsx');

    mainDb.close();
    trailDb.close();
  }, 30000);
});
