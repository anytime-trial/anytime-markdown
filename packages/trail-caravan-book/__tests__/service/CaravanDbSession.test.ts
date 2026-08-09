/**
 * CaravanDbSession のユニットテスト。
 *
 * 各 scope メソッド・初期化・cursor 前進・no-op 経路・エラーハンドリング・
 * statusWriter 分岐を実 in-memory DB への出力で検証する。
 * pipeline 関数は jest.mock でモックし、LLM 呼び出しは発生しない。
 */

import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import type { CaravanBookDb } from '../../src/db/connection';
import type { CaravanLogger } from '../../src/logger';
import { CaravanDbSession } from '../../src/service/CaravanDbSession';
import { createMockOllamaClient } from '../helpers/MockOllamaClient';

// ── pipeline モック ────────────────────────────────────────────────────────

jest.mock('../../src/pipeline/runConversationBackfill', () => ({
  DEFAULT_CONVERSATION_BACKFILL_DAYS: 5,
  runConversationBackfill: jest.fn(),
}));
jest.mock('../../src/pipeline/detectBackfillWindowExpansion', () => ({
  detectBackfillWindowExpansion: jest.fn(),
}));
jest.mock('../../src/pipeline/runConversationIncremental', () => ({
  runConversationIncremental: jest.fn(),
}));
jest.mock('../../src/pipeline/runConversationFailedItemsRetry', () => ({
  runConversationFailedItemsRetry: jest.fn(),
}));
jest.mock('../../src/pipeline/runCodeIncremental', () => ({
  runCodeIncremental: jest.fn(),
}));
jest.mock('../../src/pipeline/runCodeReconciliation', () => ({
  runCodeReconciliation: jest.fn(),
}));
jest.mock('../../src/pipeline/runBugHistoryIncremental', () => ({
  runBugHistoryIncremental: jest.fn(),
}));
// 既定では実装をそのまま通す（実 DB への出力で検証する本スイートの方針を保つ）。
// jest.fn で包むのは呼び出し回数を数えるため。個々のテストで mockImplementation を
// 差し替えれば、失敗・例外の握り潰し経路も検証できる。
jest.mock('../../src/pipeline/runReviewBackfill', () => {
  const actual = jest.requireActual('../../src/pipeline/runReviewBackfill');
  return { runReviewBackfill: jest.fn((...args: unknown[]) => actual.runReviewBackfill(...args)) };
});
jest.mock('../../src/pipeline/runReviewIncremental', () => ({
  runReviewIncremental: jest.fn(),
}));
jest.mock('../../src/pipeline/runSpecIncremental', () => ({
  runSpecIncremental: jest.fn(),
}));
// runSpecIncremental とセットでモックする。実装は specRoot（既定は開発機の
// /Shared/anytime-markdown-docs/spec）を実際に読むため、モックし忘れると
// そのパスを持つ環境でだけ通り、持たない CI でだけ落ちる。
jest.mock('../../src/pipeline/runSpecReconciliation', () => ({
  runSpecReconciliation: jest.fn(),
}));
jest.mock('../../src/pipeline/runDriftDetection', () => ({
  runDriftDetection: jest.fn(),
}));
jest.mock('../../src/pipeline/runEmbeddingBackfill', () => ({
  runEmbeddingBackfill: jest.fn(),
}));

// ── import 後にモック参照 ─────────────────────────────────────────────────

import { runConversationBackfill } from '../../src/pipeline/runConversationBackfill';
import { detectBackfillWindowExpansion } from '../../src/pipeline/detectBackfillWindowExpansion';
import { runConversationIncremental } from '../../src/pipeline/runConversationIncremental';
import { runConversationFailedItemsRetry } from '../../src/pipeline/runConversationFailedItemsRetry';
import { runCodeIncremental } from '../../src/pipeline/runCodeIncremental';
import { runCodeReconciliation } from '../../src/pipeline/runCodeReconciliation';
import { runBugHistoryIncremental } from '../../src/pipeline/runBugHistoryIncremental';
import { runReviewIncremental } from '../../src/pipeline/runReviewIncremental';
import { runReviewBackfill } from '../../src/pipeline/runReviewBackfill';
import { runSpecIncremental } from '../../src/pipeline/runSpecIncremental';
import { runSpecReconciliation } from '../../src/pipeline/runSpecReconciliation';
import { runDriftDetection } from '../../src/pipeline/runDriftDetection';
import { runEmbeddingBackfill } from '../../src/pipeline/runEmbeddingBackfill';

const mockRunConversationBackfill = runConversationBackfill as jest.MockedFunction<typeof runConversationBackfill>;
const mockDetectBackfillWindowExpansion = detectBackfillWindowExpansion as jest.MockedFunction<typeof detectBackfillWindowExpansion>;
const mockRunConversationIncremental = runConversationIncremental as jest.MockedFunction<typeof runConversationIncremental>;
const mockRunConversationFailedItemsRetry = runConversationFailedItemsRetry as jest.MockedFunction<typeof runConversationFailedItemsRetry>;
const mockRunCodeIncremental = runCodeIncremental as jest.MockedFunction<typeof runCodeIncremental>;
const mockRunCodeReconciliation = runCodeReconciliation as jest.MockedFunction<typeof runCodeReconciliation>;
const mockRunBugHistoryIncremental = runBugHistoryIncremental as jest.MockedFunction<typeof runBugHistoryIncremental>;
const mockRunReviewIncremental = runReviewIncremental as jest.MockedFunction<typeof runReviewIncremental>;
const mockRunReviewBackfill = runReviewBackfill as jest.MockedFunction<typeof runReviewBackfill>;
const mockRunSpecIncremental = runSpecIncremental as jest.MockedFunction<typeof runSpecIncremental>;
const mockRunSpecReconciliation = runSpecReconciliation as jest.MockedFunction<typeof runSpecReconciliation>;

/** runSpecReconciliation の成功戻り値。件数はすべて 0（掃除対象なし）。 */
const specReconciliationOk = {
  status: 'success',
  scanned: 0,
  removed_docs: 0,
  soft_deleted_doc_entities: 0,
  invalidated_edges: 0,
  soft_deleted_orphan_entities: 0,
  error_detail: '',
  duration_ms: 0,
} as const;
const mockRunDriftDetection = runDriftDetection as jest.MockedFunction<typeof runDriftDetection>;
const mockRunEmbeddingBackfill = runEmbeddingBackfill as jest.MockedFunction<typeof runEmbeddingBackfill>;

// ── Helper ────────────────────────────────────────────────────────────────

const silentLogger: CaravanLogger = { info: () => {}, error: () => {} };

function makeTrailDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE activity_sessions (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL DEFAULT '', repo_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'claude_code'
      CHECK (source IN ('claude_code','codex','gemini','cursor','other'))
  ) STRICT`);
  // レビュー取込が参照する列まで含めた最小 fixture（本番 trail.activity_messages は 37 列）。
  // tool_calls / subagent_type / skill が欠けると parseReviewSessions の SELECT が
  // SQL エラーになり、失敗が catch で握り潰されて経路ごと黙って死ぬ。
  db.run(`CREATE TABLE activity_messages (
    uuid TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL, timestamp TEXT, text_content TEXT, user_content TEXT,
    tool_calls TEXT, subagent_type TEXT, skill TEXT,
    is_sidechain INTEGER NOT NULL DEFAULT 0
  ) STRICT`);
  return db;
}

async function makeCaravanDb(): Promise<CaravanBookDb> {
  const rawDb = BetterSqlite3CaravanDb.openInCaravan();
  rawDb.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);
  return { db: rawDb, save: jest.fn(), close: jest.fn(() => rawDb.close()) };
}

function makeSession(
  memDb: CaravanBookDb,
  trailDb: BetterSqlite3CaravanDb,
  overrides: Partial<Parameters<typeof CaravanDbSession.prototype['constructor'] extends new (...args: infer P) => unknown ? (...args: P) => unknown : never>[0]> = {},
): CaravanDbSession {
  attachTrailDbFromHandle(memDb.db, trailDb);
  return new CaravanDbSession({
    memDb,
    ollama: createMockOllamaClient(),
    logger: silentLogger,
    gitRoot: '/tmp/test-repo',
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CaravanDbSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: backfill window 拡張なし
    mockDetectBackfillWindowExpansion.mockReturnValue({ shouldExpand: false, reason: '' });
    // デフォルト: failed-items retry は常に成功 no-op
    mockRunConversationFailedItemsRetry.mockResolvedValue({
      status: 'ok',
      items_retried: 0,
      items_failed: 0,
    });
    // デフォルト: spec の掃除は成功 no-op（失敗経路は個別テストで差し替える）
    mockRunSpecReconciliation.mockReturnValue({ ...specReconciliationOk });
  });

  // ── close() ────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('calls memDb.save() and memDb.close()', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      session.close();
      expect(memDb.save).toHaveBeenCalled();
      expect(memDb.close).toHaveBeenCalled();
      trailDb.close();
    });
  });

  // ── runConversation — throttle shouldStop ────────────────────────────

  describe('runConversation — throttle shouldStop', () => {
    it('forwards shouldStop gate to backfill', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      const gate = () => false;
      await session.runConversation({ shouldStop: gate });

      expect(mockRunConversationBackfill.mock.calls[0]?.[0]?.shouldStop).toBe(gate);
      trailDb.close();
    });

    it('skips failed-items retry when shouldStop returns true', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      mockRunConversationBackfill.mockResolvedValue({ status: 'partial', items_processed: 1, items_failed: 0 });

      const result = await session.runConversation({ shouldStop: () => true });

      expect(mockRunConversationFailedItemsRetry).not.toHaveBeenCalled();
      expect(result.scope).toBe('conversation_incremental');
      trailDb.close();
    });

    it('runs failed-items retry when shouldStop returns false', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 1, items_failed: 0 });

      await session.runConversation({ shouldStop: () => false });

      expect(mockRunConversationFailedItemsRetry).toHaveBeenCalledTimes(1);
      trailDb.close();
    });
  });

  // ── runConversation — first-run (isFirstRun=true, backfill) ───────────

  describe('runConversation — first run (backfill)', () => {
    it('calls runConversationBackfill when no cursor exists and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockResolvedValue({
        status: 'ok',
        items_processed: 3,
        items_failed: 0,
      });

      const result = await session.runConversation();

      expect(mockRunConversationBackfill).toHaveBeenCalledTimes(1);
      expect(mockRunConversationIncremental).not.toHaveBeenCalled();
      expect(result.scope).toBe('conversation_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(3);
      expect(result.itemsFailed).toBe(0);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('forwards chatModel to runConversationBackfill', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        chatModel: 'my-model',
      });

      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      await session.runConversation();

      const callArg = mockRunConversationBackfill.mock.calls[0]?.[0];
      expect(callArg?.model).toBe('my-model');

      trailDb.close();
    });

    it('returns error ScopeResult when runConversationBackfill throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockRejectedValue(new Error('backfill exploded'));

      const result = await session.runConversation();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('conversation_incremental');
      expect(result.error).toContain('backfill exploded');
      expect(result.itemsProcessed).toBe(0);

      trailDb.close();
    });

    it('returns error ScopeResult from failed-items retry scope when retry throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 2, items_failed: 0 });
      mockRunConversationFailedItemsRetry.mockRejectedValue(new Error('retry boom'));

      const result = await session.runConversation();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('conversation_failed_items_retry');
      expect(result.error).toContain('retry boom');

      trailDb.close();
    });
  });

  // ── runConversation — incremental (cursor 前進) ────────────────────────

  describe('runConversation — incremental (cursor set)', () => {
    it('calls runConversationIncremental when cursor exists', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      // cursor を事前に設定 (incremental 経路)
      memDb.db.run(
        `INSERT OR REPLACE INTO caravan_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      const session = makeSession(memDb, trailDb);

      mockRunConversationIncremental.mockResolvedValue({
        status: 'ok',
        items_processed: 0,
        items_failed: 0,
      });

      const result = await session.runConversation();

      expect(mockRunConversationIncremental).toHaveBeenCalledTimes(1);
      expect(mockRunConversationBackfill).not.toHaveBeenCalled();
      expect(result.scope).toBe('conversation_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(0);

      trailDb.close();
    });

    it('returns error when runConversationIncremental throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      memDb.db.run(
        `INSERT OR REPLACE INTO caravan_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      const session = makeSession(memDb, trailDb);
      mockRunConversationIncremental.mockRejectedValue(new Error('incremental fail'));

      const result = await session.runConversation();

      expect(result.status).toBe('error');
      expect(result.error).toContain('incremental fail');

      trailDb.close();
    });
  });

  // ── runConversation — backfill window expansion ───────────────────────

  describe('runConversation — backfill window expansion', () => {
    it('resets cursor when window expansion is detected', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      // cursor 設定済み
      memDb.db.run(
        `INSERT OR REPLACE INTO caravan_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      mockDetectBackfillWindowExpansion.mockReturnValue({
        shouldExpand: true,
        reason: 'sinceDays enlarged',
      });
      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 1, items_failed: 0 });

      const session = makeSession(memDb, trailDb);
      const result = await session.runConversation();

      // expansion → backfill 経路に倒れる
      expect(mockRunConversationBackfill).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('ok');

      trailDb.close();
    });

    it('continues gracefully when detectBackfillWindowExpansion throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      mockDetectBackfillWindowExpansion.mockImplementation(() => { throw new Error('detect fail'); });
      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      const session = makeSession(memDb, trailDb);
      const result = await session.runConversation();

      // エラーを swallow して続行し、backfill を呼ぶ
      expect(result.status).toBe('ok');

      trailDb.close();
    });
  });

  // ── runCode ────────────────────────────────────────────────────────────

  describe('runCode', () => {
    it('calls runCodeIncremental then runCodeReconciliation and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunCodeIncremental.mockResolvedValue({
        status: 'ok',
        items_processed: 5,
        current_entity_ids: new Set(['e1', 'e2']),
      });
      mockRunCodeReconciliation.mockReturnValue({ status: 'ok', soft_deleted: 0 });

      const result = await session.runCode();

      expect(mockRunCodeIncremental).toHaveBeenCalledTimes(1);
      expect(mockRunCodeReconciliation).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('code_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(5);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('skips reconciliation when code_incremental returns skipped', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunCodeIncremental.mockResolvedValue({
        status: 'skipped',
        items_processed: 0,
        current_entity_ids: new Set<string>(),
      });

      const result = await session.runCode();

      expect(mockRunCodeReconciliation).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');

      trailDb.close();
    });

    it('returns error ScopeResult when runCodeIncremental throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunCodeIncremental.mockRejectedValue(new Error('code fail'));

      const result = await session.runCode();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('code_incremental');
      expect(result.error).toContain('code fail');
      expect(mockRunCodeReconciliation).not.toHaveBeenCalled();

      trailDb.close();
    });

    it('returns error ScopeResult when runCodeReconciliation throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunCodeIncremental.mockResolvedValue({
        status: 'ok',
        items_processed: 2,
        current_entity_ids: new Set(['e1']),
      });
      mockRunCodeReconciliation.mockImplementation(() => { throw new Error('recon fail'); });

      const result = await session.runCode();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('code_reconciliation');
      expect(result.error).toContain('recon fail');

      trailDb.close();
    });

    it('uses MEMORY_CORE_TSCONFIG env var when set', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      process.env.MEMORY_CORE_TSCONFIG = '/custom/tsconfig.json';
      mockRunCodeIncremental.mockResolvedValue({
        status: 'ok',
        items_processed: 0,
        current_entity_ids: new Set<string>(),
      });
      mockRunCodeReconciliation.mockReturnValue({ status: 'ok', soft_deleted: 0 });

      await session.runCode();

      const callArg = mockRunCodeIncremental.mock.calls[0]?.[0];
      expect(callArg?.tsconfigPath).toBe('/custom/tsconfig.json');
      delete process.env.MEMORY_CORE_TSCONFIG;

      trailDb.close();
    });
  });

  // ── runBugHistory ──────────────────────────────────────────────────────

  describe('runBugHistory', () => {
    it('calls runBugHistoryIncremental and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunBugHistoryIncremental.mockResolvedValue({ status: 'ok', items_processed: 4 });

      const result = await session.runBugHistory();

      expect(mockRunBugHistoryIncremental).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('bug_history_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(4);
      expect(result.itemsFailed).toBe(0);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('returns error ScopeResult when runBugHistoryIncremental throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunBugHistoryIncremental.mockRejectedValue(new Error('bug fail'));

      const result = await session.runBugHistory();

      expect(result.status).toBe('error');
      expect(result.error).toContain('bug fail');

      trailDb.close();
    });
  });

  // ── runReview ──────────────────────────────────────────────────────────

  describe('runReview', () => {
    it('calls runReviewIncremental with reviewDir and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunReviewIncremental.mockResolvedValue({ status: 'ok', items_processed: 2 });

      const result = await session.runReview();

      expect(mockRunReviewIncremental).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('review_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(2);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    // runReviewBackfillOnce の失敗は「取込は継続」の設計で握り潰されるため、
    // 完了印と呼び出し回数を見ないと壊れていても気づけない（実測: scope の CHECK 制約に
    // 新スコープが無く、印の書き込みが毎回例外になっていた）。
    it('review_body_backfill の完了印を残し、2 回目は本体を呼ばない', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      // 走査対象を 1 件用意する（0 件だと印を保留する仕様）。
      // attach はハンドルの内容を取り込むため、**makeSession より前**に入れる。
      trailDb.run("INSERT INTO activity_sessions (id) VALUES ('s1')");
      trailDb.run(
        `INSERT INTO activity_messages (uuid, session_id, type, timestamp, text_content, subagent_type)
         VALUES ('m1', 's1', 'assistant', '2026-03-02T00:00:00.000Z', 'レビュー本文', 'code-reviewer')`,
      );
      const session = makeSession(memDb, trailDb);
      mockRunReviewIncremental.mockResolvedValue({ status: 'success', items_processed: 0 });

      await session.runReview();

      expect(mockRunReviewBackfill).toHaveBeenCalledTimes(1);
      const first = memDb.db.exec(
        "SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = 'review_body_backfill'",
      );
      expect(String(first[0]?.values?.[0]?.[0] ?? '')).not.toBe('');

      await session.runReview();

      // 実行時間が 0ms でも成立するよう、時刻比較ではなく呼び出し回数で判定する
      expect(mockRunReviewBackfill).toHaveBeenCalledTimes(1);

      trailDb.close();
    });

    it('走査対象が 0 件のときは完了印を残さない（次回再試行できる）', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      mockRunReviewIncremental.mockResolvedValue({ status: 'success', items_processed: 0 });
      // trail.activity_messages が空 = 差し替え直後・取込ラグ中。何も是正できていない

      await session.runReview();

      const rows = memDb.db.exec(
        "SELECT scope FROM caravan_pipeline_state WHERE scope = 'review_body_backfill'",
      );
      expect(rows[0]?.values ?? []).toEqual([]);

      await session.runReview();
      expect(mockRunReviewBackfill).toHaveBeenCalledTimes(2);

      trailDb.close();
    });

    it('backfill が error を返したら印を残さずログを出す（取込は継続）', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
      const session = makeSession(memDb, trailDb, { logger });
      mockRunReviewIncremental.mockResolvedValue({ status: 'success', items_processed: 0 });
      mockRunReviewBackfill.mockReturnValueOnce({
        status: 'error',
        parsed_blocks: 0,
        bodies_filled: 0,
        shells_removed: 0,
        shell_entities_invalidated: 0,
        error_detail: 'boom',
      });

      const result = await session.runReview();

      expect(result.status).toBe('success');
      expect(logger.error).toHaveBeenCalled();
      const rows = memDb.db.exec(
        "SELECT scope FROM caravan_pipeline_state WHERE scope = 'review_body_backfill'",
      );
      expect(rows[0]?.values ?? []).toEqual([]);

      trailDb.close();
    });

    it('backfill が例外を投げても取込は完走し、ログを出す', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
      const session = makeSession(memDb, trailDb, { logger });
      mockRunReviewIncremental.mockResolvedValue({ status: 'success', items_processed: 3 });
      mockRunReviewBackfill.mockImplementationOnce(() => {
        throw new Error('CHECK constraint failed');
      });

      const result = await session.runReview();

      expect(result.status).toBe('success');
      expect(result.itemsProcessed).toBe(3);
      expect(logger.error).toHaveBeenCalled();

      trailDb.close();
    });

    it('uses MEMORY_CORE_REVIEW_DIR env var', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      process.env.MEMORY_CORE_REVIEW_DIR = '/custom/review';
      mockRunReviewIncremental.mockResolvedValue({ status: 'ok', items_processed: 0 });

      await session.runReview();

      const callArg = mockRunReviewIncremental.mock.calls[0]?.[0];
      expect(callArg?.reviewDir).toBe('/custom/review');
      delete process.env.MEMORY_CORE_REVIEW_DIR;

      trailDb.close();
    });

    it('uses chatModel or MEMORY_CORE_GEN_MODEL for model', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        chatModel: 'custom-gen-model',
      });

      mockRunReviewIncremental.mockResolvedValue({ status: 'ok', items_processed: 0 });

      await session.runReview();

      const callArg = mockRunReviewIncremental.mock.calls[0]?.[0];
      expect(callArg?.model).toBe('custom-gen-model');

      trailDb.close();
    });

    it('returns error ScopeResult when runReviewIncremental throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunReviewIncremental.mockRejectedValue(new Error('review fail'));

      const result = await session.runReview();

      expect(result.status).toBe('error');
      expect(result.error).toContain('review fail');

      trailDb.close();
    });
  });

  // ── runSpec ────────────────────────────────────────────────────────────

  describe('runSpec', () => {
    it('calls runSpecIncremental with specRoot and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunSpecIncremental.mockResolvedValue({ status: 'ok', items_processed: 1 });

      const result = await session.runSpec();

      expect(mockRunSpecIncremental).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('spec_incremental');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(1);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('uses MEMORY_CORE_SPEC_DIR env var', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      process.env.MEMORY_CORE_SPEC_DIR = '/custom/spec';
      mockRunSpecIncremental.mockResolvedValue({ status: 'ok', items_processed: 0 });

      await session.runSpec();

      const callArg = mockRunSpecIncremental.mock.calls[0]?.[0];
      expect(callArg?.specRoot).toBe('/custom/spec');
      expect(mockRunSpecReconciliation.mock.calls[0]?.[0]?.specRoot).toBe('/custom/spec');
      delete process.env.MEMORY_CORE_SPEC_DIR;

      trailDb.close();
    });

    // 掃除の失敗は取込が成功していても error として上げる。ここを緩めると
    // specRoot が読めない状態が続いてもパイプラインは success を報告し続ける。
    it('reports error when reconciliation fails even if the incremental run succeeded', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunSpecIncremental.mockResolvedValue({ status: 'ok', items_processed: 3 });
      mockRunSpecReconciliation.mockReturnValue({
        ...specReconciliationOk,
        status: 'error',
        error_detail: 'specRoot unreadable',
      });

      const result = await session.runSpec();

      expect(result.status).toBe('error');
      expect(result.error).toBe('specRoot unreadable');
      expect(result.itemsProcessed).toBe(3);

      trailDb.close();
    });

    it('returns error ScopeResult when runSpecIncremental throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunSpecIncremental.mockRejectedValue(new Error('spec fail'));

      const result = await session.runSpec();

      expect(result.status).toBe('error');
      expect(result.error).toContain('spec fail');

      trailDb.close();
    });
  });

  // ── runDrift ───────────────────────────────────────────────────────────

  describe('runDrift', () => {
    it('calls runDriftDetection and returns ScopeResult with combined event count', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunDriftDetection.mockResolvedValue({
        status: 'ok',
        events_inserted: 3,
        events_updated: 2,
      });

      const result = await session.runDrift();

      expect(mockRunDriftDetection).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('drift_detection');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(5); // 3 + 2
      expect(result.itemsFailed).toBe(0);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('returns error ScopeResult when runDriftDetection throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunDriftDetection.mockRejectedValue(new Error('drift fail'));

      const result = await session.runDrift();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('drift_detection');
      expect(result.error).toContain('drift fail');

      trailDb.close();
    });

    it('returns no-op result when drift returns 0 events', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunDriftDetection.mockResolvedValue({ status: 'ok', events_inserted: 0, events_updated: 0 });

      const result = await session.runDrift();

      expect(result.itemsProcessed).toBe(0);
      expect(result.status).toBe('ok');

      trailDb.close();
    });
  });

  // ── runEmbeddingBackfill ───────────────────────────────────────────────

  describe('runEmbeddingBackfill', () => {
    it('calls runEmbeddingBackfill and returns ScopeResult', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunEmbeddingBackfill.mockResolvedValue({
        status: 'success',
        items_processed: 10,
        items_failed: 1,
        items_skipped: 0,
        processed_by_target: { entities: 10, episodes: 0, spec_documents: 0 },
      });

      const result = await session.runEmbeddingBackfill();

      expect(mockRunEmbeddingBackfill).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('embedding_backfill');
      expect(result.status).toBe('success');
      expect(result.itemsProcessed).toBe(10);
      expect(result.itemsFailed).toBe(1);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('forwards embedModel to runEmbeddingBackfill', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        embedModel: 'my-embed-model',
      });

      mockRunEmbeddingBackfill.mockResolvedValue({ status: 'success', items_processed: 0, items_failed: 0, items_skipped: 0, processed_by_target: { entities: 0, episodes: 0, spec_documents: 0 } });

      await session.runEmbeddingBackfill();

      const callArg = mockRunEmbeddingBackfill.mock.calls[0]?.[0];
      expect(callArg?.embedModel).toBe('my-embed-model');

      trailDb.close();
    });

    it('returns error ScopeResult when runEmbeddingBackfill throws', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunEmbeddingBackfill.mockRejectedValue(new Error('embed fail'));

      const result = await session.runEmbeddingBackfill();

      expect(result.status).toBe('error');
      expect(result.scope).toBe('embedding_backfill');
      expect(result.error).toContain('embed fail');

      trailDb.close();
    });
  });

  // ── statusWriter 分岐 ──────────────────────────────────────────────────

  describe('statusWriter integration', () => {
    it('calls statusWriter.start and statusWriter.finish when provided', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunDriftDetection.mockResolvedValue({ status: 'ok', events_inserted: 1, events_updated: 0 });

      await session.runDrift();

      expect(statusWriter.start).toHaveBeenCalledWith('drift_detection');
      expect(statusWriter.finish).toHaveBeenCalledWith('drift_detection', 'ok', 1, 0);

      trailDb.close();
    });

    it('calls statusWriter.finish with error on exception', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunDriftDetection.mockRejectedValue(new Error('status fail'));

      const result = await session.runDrift();

      expect(statusWriter.finish).toHaveBeenCalledWith('drift_detection', 'error', 0, 0, expect.stringContaining('status fail'));
      expect(result.status).toBe('error');

      trailDb.close();
    });

    it('calls statusWriter.start with total for conversation (pre-count)', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      await session.runConversation();

      expect(statusWriter.start).toHaveBeenCalledWith('conversation_incremental', undefined);

      trailDb.close();
    });
  });

  // ── repoName はgitRootのbasename ─────────────────────────────────────

  describe('repoName from gitRoot', () => {
    it('passes repoName (basename of gitRoot) to runBugHistoryIncremental', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/path/to/my-special-repo',
      });

      mockRunBugHistoryIncremental.mockResolvedValue({ status: 'ok', items_processed: 0 });

      await session.runBugHistory();

      const callArg = mockRunBugHistoryIncremental.mock.calls[0]?.[0];
      expect(callArg?.repoName).toBe('my-special-repo');

      trailDb.close();
    });
  });

  // ── backfillDays デフォルト ─────────────────────────────────────────────

  describe('backfillDays fallback', () => {
    it('uses DEFAULT_CONVERSATION_BACKFILL_DAYS when backfillDays not specified', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb); // backfillDays 未指定

      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      await session.runConversation();

      const callArg = mockRunConversationBackfill.mock.calls[0]?.[0];
      // DEFAULT_CONVERSATION_BACKFILL_DAYS = 5
      expect(callArg?.sinceDays).toBe(5);

      trailDb.close();
    });
  });

  // ── コールバック経路 (save / progress / onTotal) ───────────────────────

  /** Incremental/Backfill Result の counter 部分（stub 用の全量ゼロ） */
  const zeroConversationCounters = {
    items_skipped: 0,
    entities_inserted: 0,
    entities_updated: 0,
    entities_suppressed: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    edges_suppressed: 0,
  } as const;

  describe('callback paths', () => {
    it('invokes save callback passed to runConversationBackfill', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockImplementation(async (opts) => {
        // save コールバックを実際に呼ぶ
        opts.save?.();
        return { status: 'success' as const, items_processed: 1, items_failed: 0, ...zeroConversationCounters };
      });

      await session.runConversation();

      // save が複数回呼ばれていること (callback + after backfill)
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes save callback passed to runConversationIncremental', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      // incremental 経路へ
      memDb.db.run(
        `INSERT OR REPLACE INTO caravan_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      const session = makeSession(memDb, trailDb);

      mockRunConversationIncremental.mockImplementation(async (opts) => {
        opts.save?.();
        return { status: 'success' as const, items_processed: 0, items_failed: 0, ...zeroConversationCounters };
      });

      await session.runConversation();

      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes save callback passed to runConversationFailedItemsRetry', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockResolvedValue({
        status: 'success' as const, items_processed: 0, items_failed: 0, ...zeroConversationCounters,
      });
      mockRunConversationFailedItemsRetry.mockImplementation(async (opts) => {
        opts.save?.();
        return { status: 'success' as const, items_retried: 0, items_recovered: 0, items_failed: 0 };
      });

      await session.runConversation();

      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes onTotal and progress callbacks from backfill when statusWriter present', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunConversationBackfill.mockImplementation(async (opts) => {
        opts.onTotal?.(10);
        opts.progress?.(3, 0);
        return { status: 'success' as const, items_processed: 3, items_failed: 0, ...zeroConversationCounters };
      });

      await session.runConversation();

      expect(statusWriter.start).toHaveBeenCalledWith('conversation_incremental', 10);
      expect(statusWriter.update).toHaveBeenCalledWith('conversation_incremental', 3, 0);

      trailDb.close();
    });

    it('invokes progress callback from incremental when statusWriter present', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      // incremental 経路へ
      const rawDb = (memDb as { db: BetterSqlite3CaravanDb }).db;
      rawDb.run(
        `INSERT OR REPLACE INTO caravan_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunConversationIncremental.mockImplementation(async (opts) => {
        opts.progress?.(2, 1);
        return { status: 'success' as const, items_processed: 2, items_failed: 1, ...zeroConversationCounters };
      });

      await session.runConversation();

      expect(statusWriter.update).toHaveBeenCalledWith('conversation_incremental', 2, 1);

      trailDb.close();
    });

    it('invokes onTotal and progress callbacks from embedding backfill when statusWriter present', async () => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new CaravanDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunEmbeddingBackfill.mockImplementation(async (opts) => {
        opts.onTotal?.(5);
        opts.progress?.(2, 0);
        return {
          status: 'success',
          items_processed: 2,
          items_failed: 0,
          items_skipped: 0,
          processed_by_target: { entities: 2, episodes: 0, spec_documents: 0 },
        };
      });

      await session.runEmbeddingBackfill();

      expect(statusWriter.start).toHaveBeenCalledWith('embedding_backfill', 5);
      expect(statusWriter.update).toHaveBeenCalledWith('embedding_backfill', 2, 0);

      trailDb.close();
    });
  });
});
