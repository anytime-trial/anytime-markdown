/**
 * MemoryDbSession のユニットテスト。
 *
 * 各 scope メソッド・初期化・cursor 前進・no-op 経路・エラーハンドリング・
 * statusWriter 分岐を実 in-memory DB への出力で検証する。
 * pipeline 関数は jest.mock でモックし、LLM 呼び出しは発生しない。
 */

import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import type { MemoryCoreDb } from '../../src/db/connection';
import type { MemoryLogger } from '../../src/logger';
import { MemoryDbSession } from '../../src/service/MemoryDbSession';
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
jest.mock('../../src/pipeline/runReviewIncremental', () => ({
  runReviewIncremental: jest.fn(),
}));
jest.mock('../../src/pipeline/runSpecIncremental', () => ({
  runSpecIncremental: jest.fn(),
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
import { runSpecIncremental } from '../../src/pipeline/runSpecIncremental';
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
const mockRunSpecIncremental = runSpecIncremental as jest.MockedFunction<typeof runSpecIncremental>;
const mockRunDriftDetection = runDriftDetection as jest.MockedFunction<typeof runDriftDetection>;
const mockRunEmbeddingBackfill = runEmbeddingBackfill as jest.MockedFunction<typeof runEmbeddingBackfill>;

// ── Helper ────────────────────────────────────────────────────────────────

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

function makeTrailDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL DEFAULT '', repo_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'claude_code'
      CHECK (source IN ('claude_code','codex','gemini','cursor','other'))
  ) STRICT`);
  db.run(`CREATE TABLE messages (
    uuid TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL, timestamp TEXT, text_content TEXT, user_content TEXT
  ) STRICT`);
  return db;
}

async function makeMemoryDb(): Promise<MemoryCoreDb> {
  const rawDb = BetterSqlite3MemoryDb.openInMemory();
  rawDb.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);
  return { db: rawDb, save: jest.fn(), close: jest.fn(() => rawDb.close()) };
}

function makeSession(
  memDb: MemoryCoreDb,
  trailDb: BetterSqlite3MemoryDb,
  overrides: Partial<Parameters<typeof MemoryDbSession.prototype['constructor'] extends new (...args: infer P) => unknown ? (...args: P) => unknown : never>[0]> = {},
): MemoryDbSession {
  attachTrailDbFromHandle(memDb.db, trailDb);
  return new MemoryDbSession({
    memDb,
    ollama: createMockOllamaClient(),
    logger: silentLogger,
    gitRoot: '/tmp/test-repo',
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('MemoryDbSession', () => {
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
  });

  // ── close() ────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('calls memDb.save() and memDb.close()', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);
      session.close();
      expect(memDb.save).toHaveBeenCalled();
      expect(memDb.close).toHaveBeenCalled();
      trailDb.close();
    });
  });

  // ── runConversation — first-run (isFirstRun=true, backfill) ───────────

  describe('runConversation — first run (backfill)', () => {
    it('calls runConversationBackfill when no cursor exists and returns ScopeResult', async () => {
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      // cursor を事前に設定 (incremental 経路)
      memDb.db.run(
        `INSERT OR REPLACE INTO memory_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      memDb.db.run(
        `INSERT OR REPLACE INTO memory_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      // cursor 設定済み
      memDb.db.run(
        `INSERT OR REPLACE INTO memory_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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

    it('uses MEMORY_CORE_REVIEW_DIR env var', async () => {
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      process.env.MEMORY_CORE_SPEC_DIR = '/custom/spec';
      mockRunSpecIncremental.mockResolvedValue({ status: 'ok', items_processed: 0 });

      await session.runSpec();

      const callArg = mockRunSpecIncremental.mock.calls[0]?.[0];
      expect(callArg?.specRoot).toBe('/custom/spec');
      delete process.env.MEMORY_CORE_SPEC_DIR;

      trailDb.close();
    });

    it('returns error ScopeResult when runSpecIncremental throws', async () => {
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunEmbeddingBackfill.mockResolvedValue({
        status: 'ok',
        items_processed: 10,
        items_failed: 1,
      });

      const result = await session.runEmbeddingBackfill();

      expect(mockRunEmbeddingBackfill).toHaveBeenCalledTimes(1);
      expect(result.scope).toBe('embedding_backfill');
      expect(result.status).toBe('ok');
      expect(result.itemsProcessed).toBe(10);
      expect(result.itemsFailed).toBe(1);
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('forwards embedModel to runEmbeddingBackfill', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        embedModel: 'my-embed-model',
      });

      mockRunEmbeddingBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });

      await session.runEmbeddingBackfill();

      const callArg = mockRunEmbeddingBackfill.mock.calls[0]?.[0];
      expect(callArg?.embedModel).toBe('my-embed-model');

      trailDb.close();
    });

    it('returns error ScopeResult when runEmbeddingBackfill throws', async () => {
      const memDb = await makeMemoryDb();
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
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
      const memDb = await makeMemoryDb();
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

  describe('callback paths', () => {
    it('invokes save callback passed to runConversationBackfill', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockImplementation(async (opts) => {
        // save コールバックを実際に呼ぶ
        opts.save?.();
        return { status: 'ok', items_processed: 1, items_failed: 0 };
      });

      await session.runConversation();

      // save が複数回呼ばれていること (callback + after backfill)
      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes save callback passed to runConversationIncremental', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      // incremental 経路へ
      memDb.db.run(
        `INSERT OR REPLACE INTO memory_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
        ['conversation_incremental', '2026-01-01T00:00:00.000Z'],
      );

      const session = makeSession(memDb, trailDb);

      mockRunConversationIncremental.mockImplementation(async (opts) => {
        opts.save?.();
        return { status: 'ok', items_processed: 0, items_failed: 0 };
      });

      await session.runConversation();

      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes save callback passed to runConversationFailedItemsRetry', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();
      const session = makeSession(memDb, trailDb);

      mockRunConversationBackfill.mockResolvedValue({ status: 'ok', items_processed: 0, items_failed: 0 });
      mockRunConversationFailedItemsRetry.mockImplementation(async (opts) => {
        opts.save?.();
        return { status: 'ok', items_retried: 0, items_failed: 0 };
      });

      await session.runConversation();

      expect(memDb.save).toHaveBeenCalled();

      trailDb.close();
    });

    it('invokes onTotal and progress callbacks from backfill when statusWriter present', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunConversationBackfill.mockImplementation(async (opts) => {
        opts.onTotal?.(10);
        opts.progress?.(3, 0);
        return { status: 'ok', items_processed: 3, items_failed: 0 };
      });

      await session.runConversation();

      expect(statusWriter.start).toHaveBeenCalledWith('conversation_incremental', 10);
      expect(statusWriter.update).toHaveBeenCalledWith('conversation_incremental', 3, 0);

      trailDb.close();
    });

    it('invokes progress callback from incremental when statusWriter present', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      // incremental 経路へ
      const rawDb = (memDb as { db: BetterSqlite3MemoryDb }).db;
      rawDb.run(
        `INSERT OR REPLACE INTO memory_pipeline_state (scope, last_processed_at) VALUES (?, ?)`,
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
      const session = new MemoryDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunConversationIncremental.mockImplementation(async (opts) => {
        opts.progress?.(2, 1);
        return { status: 'ok', items_processed: 2, items_failed: 1 };
      });

      await session.runConversation();

      expect(statusWriter.update).toHaveBeenCalledWith('conversation_incremental', 2, 1);

      trailDb.close();
    });

    it('invokes onTotal and progress callbacks from embedding backfill when statusWriter present', async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb();

      const statusWriter = {
        start: jest.fn(),
        update: jest.fn(),
        finish: jest.fn(),
        markAllSkipped: jest.fn(),
        initialize: jest.fn(),
      };

      attachTrailDbFromHandle(memDb.db, trailDb);
      const session = new MemoryDbSession({
        memDb,
        ollama: createMockOllamaClient(),
        logger: silentLogger,
        gitRoot: '/tmp/test-repo',
        statusWriter: statusWriter as unknown as import('../../src/status/PipelineStatusWriter').PipelineStatusWriter,
      });

      mockRunEmbeddingBackfill.mockImplementation(async (opts) => {
        opts.onTotal?.(5);
        opts.progress?.(2, 0);
        return { status: 'ok', items_processed: 2, items_failed: 0 };
      });

      await session.runEmbeddingBackfill();

      expect(statusWriter.start).toHaveBeenCalledWith('embedding_backfill', 5);
      expect(statusWriter.update).toHaveBeenCalledWith('embedding_backfill', 2, 0);

      trailDb.close();
    });
  });
});
