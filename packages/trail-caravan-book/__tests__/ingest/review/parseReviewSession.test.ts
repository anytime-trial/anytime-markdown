import { allWorkspacesScope } from '../../../src/ingest/workspaceScope';
import { BetterSqlite3CaravanDb } from '../../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { parseReviewSessions } from '../../../src/ingest/review/parseReviewSession';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a minimal trail-caravan-book main DB (no migrations needed — we just need
 * the attach guard to work, which requires caravan_failed_items table).
 */
function makeMainDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS caravan_failed_items (
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
function makeTrailDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run(`
    CREATE TABLE activity_messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text_content TEXT,
      tool_calls TEXT,
      subagent_type TEXT,
      skill TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0
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
  is_sidechain?: number;
};

/**
 * 既定の本文。空本文のブロックは「レビュー結果ではない」として登録対象外になるため、
 * 本文の有無が論点でないテストでは最低限の本文を持たせる（実データでもレビューの
 * メッセージ列には必ず何らかの本文がある）。
 */
const DEFAULT_TEXT = 'レビュー本文';

function insertMsg(trailDb: BetterSqlite3CaravanDb, opts: InsertMsgOpts): void {
  trailDb.run(
    `INSERT INTO activity_messages
      (uuid, session_id, type, timestamp, text_content, tool_calls, subagent_type, skill, is_sidechain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.uuid,
      opts.session_id,
      opts.type ?? 'user',
      opts.timestamp,
      opts.text_content ?? DEFAULT_TEXT,
      opts.tool_calls ?? null,
      opts.subagent_type ?? null,
      opts.skill ?? null,
      opts.is_sidechain ?? 0,
    ],
  );
}

const silentLogger = { warn: (_msg: string) => {} };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseReviewSessions', () => {
  // Test 1: empty DB → []
  test('本文が 1 文字も無いブロックは登録しない（スキル起動だけの痕跡）', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'skill-only',
      session_id: 'sess-skill',
      type: 'user',
      timestamp: '2026-03-02T08:00:00.000Z',
      text_content: '',
      skill: 'superpowers:requesting-code-review',
    });
    insertMsg(trailDb, {
      uuid: 'real-review',
      session_id: 'sess-skill',
      type: 'assistant',
      timestamp: '2026-03-02T08:01:00.000Z',
      text_content: '### 1. 指摘\n\n**問題:** あれ\n**提案:** これ',
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].reviewer).toBe('pr-review-toolkit:code-reviewer');

    mainDb.close();
    trailDb.close();
  }, 30000);

  test('30 分以上空いた同ラベルのメッセージは別レビューとして分割する', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'morning-1',
      session_id: 'sess-long',
      type: 'assistant',
      timestamp: '2026-03-02T01:00:00.000Z',
      text_content: '午前のレビュー本文',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'afternoon-1',
      session_id: 'sess-long',
      type: 'assistant',
      timestamp: '2026-03-02T05:00:00.000Z',
      text_content: '午後のレビュー本文',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.message_uuid_start)).toEqual(['morning-1', 'afternoon-1']);
    expect(results[0].body_excerpt).toBe('午前のレビュー本文');
    expect(results[1].body_excerpt).toBe('午後のレビュー本文');

    mainDb.close();
    trailDb.close();
  }, 30000);

  test('30 分以内の同ラベルは 1 ブロックにまとめる', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'part-1',
      session_id: 'sess-near',
      type: 'assistant',
      timestamp: '2026-03-02T01:00:00.000Z',
      text_content: '前半',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'part-2',
      session_id: 'sess-near',
      type: 'assistant',
      timestamp: '2026-03-02T01:20:00.000Z',
      text_content: '後半',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].body_excerpt).toBe('前半\n---\n後半');

    mainDb.close();
    trailDb.close();
  }, 30000);

  test('summary に指摘の内訳と本文長を機械生成する', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'with-findings',
      session_id: 'sess-sum',
      type: 'assistant',
      timestamp: '2026-03-02T01:00:00.000Z',
      text_content: '### 1. こわれている\n\n- **重大度**: error\n\n**問題:** 落ちる\n**提案:** 直す',
      subagent_type: 'code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'no-findings',
      session_id: 'sess-sum2',
      type: 'assistant',
      timestamp: '2026-03-02T01:00:00.000Z',
      text_content: '指摘はありませんでした。',
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    const withFindings = results.find((r) => r.session_id === 'sess-sum')!;
    const without = results.find((r) => r.session_id === 'sess-sum2')!;
    expect(withFindings.summary).toMatch(/^指摘 1 件（error 1 \/ warn 0 \/ info 0）・本文 \d+ 文字$/);
    // 「指摘なし」と「本文を取り込めていない」を区別できること
    expect(without.summary).toBe('指摘なし（本文 12 文字）');

    mainDb.close();
    trailDb.close();
  }, 30000);

  test('returns [] when no matching messages', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // 会話取込は is_sidechain=1 を除外するが、レビュー取込は **除外してはならない**。
  // code-reviewer subagent の往復はすべて sidechain として記録されるため、
  // ここへ同じ条件が混入すると findings が 1 件も取り込まれなくなる。
  // messageFilter.ts の警告コメントを、実際に落ちる検査へ変換したもの。
  test('sidechain(is_sidechain=1) の code-reviewer メッセージを取り込む', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'sc-1',
      session_id: 'sess-sidechain',
      type: 'user',
      timestamp: '2026-03-01T10:00:00.000Z',
      text_content: 'レビューをお願いします',
      subagent_type: 'code-reviewer',
      is_sidechain: 1,
    });
    insertMsg(trailDb, {
      uuid: 'sc-2',
      session_id: 'sess-sidechain',
      type: 'assistant',
      timestamp: '2026-03-01T10:01:00.000Z',
      text_content: 'レビュー結果です',
      subagent_type: 'code-reviewer',
      is_sidechain: 1,
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].session_id).toBe('sess-sidechain');

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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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

  // Test 5b: plugin-namespaced code-reviewer (pr-review-toolkit:code-reviewer 等) も捕捉する。
  // プラグイン由来の agent は meta.json の agentType が `<plugin>:code-reviewer` 形式で
  // 記録されるため、bare 'code-reviewer' / 'superpowers:code-reviewer' だけでは取りこぼす。
  test('captures plugin-namespaced code-reviewer subagent_type (e.g. pr-review-toolkit)', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'plugin-rev-1',
      session_id: 'sess-plugin-pr',
      type: 'assistant',
      timestamp: '2026-03-08T10:00:00.000Z',
      text_content: 'レビュー結果です',
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });
    insertMsg(trailDb, {
      uuid: 'plugin-rev-2',
      session_id: 'sess-plugin-fd',
      type: 'assistant',
      timestamp: '2026-03-08T11:00:00.000Z',
      text_content: 'レビュー結果です',
      subagent_type: 'feature-dev:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    const sessionIds = results.map((r) => r.session_id).sort();
    expect(sessionIds).toEqual(['sess-plugin-fd', 'sess-plugin-pr']);

    mainDb.close();
    trailDb.close();
  }, 30000);

  // Test 5c: code-reviewer を含むが別語尾の agent は誤捕捉しない（過剰マッチ防止）。
  test('does not capture unrelated agents whose name merely contains code-review', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'unrelated-1',
      session_id: 'sess-unrelated',
      type: 'assistant',
      timestamp: '2026-03-09T10:00:00.000Z',
      text_content: '無関係',
      subagent_type: 'code-review-summarizer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toEqual([]);

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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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

    // body_excerpt は保存用に BODY_EXCERPT_MAX(4096) で切り詰める（finding 抽出は全文）。
    // 3 messages × 2048 + 2 × 5(separator '\n---\n') = 6154 chars > 4096
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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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
      { input: { prompt: 'Review `packages/trail-caravan-book/src/index.ts`' } },
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
      workspaceScope: allWorkspacesScope(),
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
      workspaceScope: allWorkspacesScope(),
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

  // session 経路（code-reviewer subagent 出力）でもメタデータ行の 対象 を読む。
  // これを読まないと、書式どおり対象を書いたレビューでも target_file_path が NULL になり、
  // 対処コミットの自動リンク（linkAddresses）の母集合から外れる。
  test('メタデータ行の 対象 を target_file_path に採る（本文推測より優先）', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const reviewText = `## レビュー指摘事項

### 1. NULL 参照

- **重大度**: error
- **カテゴリ**: logic
- **対象**: \`packages/trail-viewer/src/views/a.ts:12\`
- **観点**: §8

**問題:** \`src/foo.ts\` のようなコード例を含む本文。

**提案:** optional chaining を使う。
`;

    insertMsg(trailDb, {
      uuid: 'target-marker-uuid',
      session_id: 'sess-target-marker',
      type: 'assistant',
      timestamp: '2026-04-25T11:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].findings[0].target_file_path).toBe('packages/trail-viewer/src/views/a.ts');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // reviewer はブロックのラベル(subagent_type)になる。旧実装は 'unknown' 固定で、
  // caravan_reviews.reviewer が全件空になっていた(RC1)。
  test('sets reviewer from subagent_type label', async () => {
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
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].reviewer).toBe('superpowers:code-reviewer');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // subagent_type が無くスキル経由のレビューは skill ラベルを reviewer にする。
  test('falls back to skill label when subagent_type is null', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    insertMsg(trailDb, {
      uuid: 'rev-skill-1',
      session_id: 'sess-skill',
      type: 'assistant',
      timestamp: '2026-05-02T10:00:00.000Z',
      subagent_type: null,
      skill: 'superpowers:requesting-code-review',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].reviewer).toBe('superpowers:requesting-code-review');

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
      workspaceScope: allWorkspacesScope(),
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
      { input: { path: 'packages/trail-caravan-book/src/db/connection.ts' } },
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
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_refs).toContain('packages/web-app/src/pages/index.tsx');
    expect(results[0].target_refs).toContain('packages/trail-caravan-book/src/db/connection.ts');

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
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].target_refs).toContain('packages/trail-viewer/src/components/App.tsx');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // 回帰テスト(根本原因B): 1メッセージに収まる長いレビュー(>2048文字・複数 finding)が
  // SQL の SUBSTR(text_content,1,2048) で切り詰められ、後半の finding が脱落していた。
  // 実例: 6836文字・6件のレビューが 2件しか取り込まれなかった。
  test('extracts all findings from a long single review message (no 2048 truncation)', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const blocks: string[] = [];
    for (let i = 1; i <= 6; i++) {
      blocks.push(
        `### ${i}. 指摘タイトル${i}\n\n` +
          `**問題:** これは指摘${i}の問題説明。${'詳細な背景説明を補う。'.repeat(20)}\n\n` +
          `**提案:** これは指摘${i}の提案。${'具体的な対処方針を述べる。'.repeat(20)}`,
      );
    }
    const reviewText = `## レビュー指摘事項\n\n${blocks.join('\n\n')}`;
    expect(reviewText.length).toBeGreaterThan(2048); // 旧実装はここで切り詰めていた

    insertMsg(trailDb, {
      uuid: 'long-review-1',
      session_id: 'sess-long-review',
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].findings).toHaveLength(6);
    // 末尾 finding まで取り込まれている（切り詰めなら欠落）
    expect(results[0].findings[5].finding_text).toContain('指摘6の問題説明');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // 回帰テスト(根本原因A): anytime-trail-review の `- 重大度: warn` 明示マーカーを解析する。
  // 旧実装は本文キーワード/見出し推論のみで、warn キーワードを含まない warn 指摘を
  // 既定の info に誤判定していた。
  test('honors explicit `重大度:` severity marker over keyword inference', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const reviewText = `### 1. 並行実行の設計

- **重大度**: warn
- **カテゴリ**: logic

**問題:** setInterval が前回の完了を待たずに次を呼ぶ可能性がある。
**提案:** 実行中フラグでガードする。`;

    insertMsg(trailDb, {
      uuid: 'sev-marker-1',
      session_id: 'sess-sev-marker',
      type: 'assistant',
      timestamp: '2026-05-11T10:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].findings).toHaveLength(1);
    expect(results[0].findings[0].severity).toBe('warn');
    // 観点マーカー未記載 → null（未記録）
    expect(results[0].findings[0].checklist_ref).toBeNull();

    mainDb.close();
    trailDb.close();
  }, 30000);

  // P1 (観点キー): anytime-trail-review のメタデータ 4 行目 `- **観点**: §N / none` を解析する。
  test('parses explicit `観点:` checklist marker into checklist_ref', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const reviewText = `### 1. 非同期処理の競合

- **重大度**: warn
- **カテゴリ**: logic
- **観点**: §9

**問題:** 複数の非同期処理が同じ状態を更新している。
**提案:** AbortController でキャンセルを入れる。

### 2. チェックリスト外の指摘

- **重大度**: info
- **カテゴリ**: other
- **観点**: none

**問題:** チェックリストのどの章にも該当しない構造上の懸念。
**提案:** 観点昇格の検討対象とする。`;

    insertMsg(trailDb, {
      uuid: 'checklist-marker-1',
      session_id: 'sess-checklist-marker',
      type: 'assistant',
      timestamp: '2026-05-11T11:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].findings).toHaveLength(2);
    expect(results[0].findings[0].checklist_ref).toBe('§9');
    expect(results[0].findings[1].checklist_ref).toBe('none');

    mainDb.close();
    trailDb.close();
  }, 30000);

  // 明示マーカーが無い場合は従来どおりキーワード/見出し推論にフォールバックする。
  test('falls back to keyword inference when no severity marker present', async () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();

    const reviewText = `### 1. セキュリティ

**問題:** XSS 脆弱性がある。
**提案:** DOMPurify を適用する。`;

    insertMsg(trailDb, {
      uuid: 'sev-fallback-1',
      session_id: 'sess-sev-fallback',
      type: 'assistant',
      timestamp: '2026-05-12T10:00:00.000Z',
      text_content: reviewText,
      subagent_type: 'pr-review-toolkit:code-reviewer',
    });

    attachTrailDbFromHandle(mainDb, trailDb);

    const results = parseReviewSessions({
      workspaceScope: allWorkspacesScope(),
      db: mainDb,
      sinceISO: '2026-01-01T00:00:00.000Z',
      logger: silentLogger,
    });

    expect(results[0].findings[0].severity).toBe('error'); // XSS キーワード → error

    mainDb.close();
    trailDb.close();
  }, 30000);
});
