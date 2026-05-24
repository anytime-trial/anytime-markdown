import * as path from 'node:path';

import type { OllamaClient } from '@anytime-markdown/agent-core';

import type { MemoryCoreDb } from '../db/connection';
import {
  DEFAULT_CONVERSATION_BACKFILL_DAYS,
  runConversationBackfill,
} from '../pipeline/runConversationBackfill';
import { detectBackfillWindowExpansion } from '../pipeline/detectBackfillWindowExpansion';
import { runConversationIncremental } from '../pipeline/runConversationIncremental';
import { runConversationFailedItemsRetry } from '../pipeline/runConversationFailedItemsRetry';
import { runCodeIncremental } from '../pipeline/runCodeIncremental';
import { runCodeReconciliation } from '../pipeline/runCodeReconciliation';
import { runBugHistoryIncremental } from '../pipeline/runBugHistoryIncremental';
import { runReviewIncremental } from '../pipeline/runReviewIncremental';
import { runSpecIncremental } from '../pipeline/runSpecIncremental';
import { runDriftDetection } from '../pipeline/runDriftDetection';
import { runEmbeddingBackfill } from '../pipeline/runEmbeddingBackfill';
import type { PipelineStatusWriter } from '../status/PipelineStatusWriter';
import type { PipelineLogger } from './types';

/**
 * memory-core の 1 scope 実行結果。`run*Incremental` の `status` をそのまま伝播し、
 * 失敗時は `error` にメッセージを載せる (scope メソッド自体は throw しない)。
 */
export interface ScopeResult {
  scope: string;
  status: string;
  itemsProcessed: number;
  itemsFailed: number;
  error?: string;
}

/**
 * memory-core の 9 pipeline scope を 7 ドメインメソッドにグルーピングした実行 API。
 *
 * - `runConversation`: conversation backfill/incremental + failed-items retry
 * - `runCode`:         code incremental + reconciliation (current_entity_ids を内部受け渡し)
 * - `runBugHistory`:   bug history incremental
 * - `runReview`:       review incremental
 * - `runSpec`:         spec incremental
 * - `runDrift`:        多源 drift detection
 * - `runEmbeddingBackfill`: NULL embedding 補完
 */
/** conversation scope の実行オプション。 */
export interface RunConversationOptions {
  /**
   * 会話ループ境界で確認する中断ゲート。true を返すと incremental/backfill を
   * 途中で打ち切り、failed-items retry も skip して partial を返す
   * (Ollama throttle COOLING 時の会話スキップ用)。cursor は据え置き。
   */
  shouldStop?: () => boolean;
}

export interface MemoryCoreScopeRunner {
  runConversation(opts?: RunConversationOptions): Promise<ScopeResult>;
  runCode(): Promise<ScopeResult>;
  runBugHistory(): Promise<ScopeResult>;
  runReview(): Promise<ScopeResult>;
  runSpec(): Promise<ScopeResult>;
  runDrift(): Promise<ScopeResult>;
  runEmbeddingBackfill(): Promise<ScopeResult>;
}

export interface MemoryDbSessionDeps {
  /** open 済み memory-core DB (trail.db を ATTACH 済みであること)。 */
  memDb: MemoryCoreDb;
  /** chat / embedding 用 Ollama クライアント。LLM 非依存 scope では未使用。 */
  ollama: OllamaClient;
  logger: PipelineLogger;
  /** UI 表示用 status writer。省略時は status を書かない (テスト等)。 */
  statusWriter?: PipelineStatusWriter;
  /** Git working tree ルート (code / bug history / tsconfig 解決に使用)。 */
  gitRoot: string;
  /** 初回 backfill 期間 (日)。 */
  backfillDays?: number;
  /**
   * 生成モデル (lep.json + env MEMORY_CORE_GEN_MODEL を解決した値)。
   * 省略時は各 run\* の env / 内蔵既定 (`qwen2.5:7b`) にフォールバック。
   */
  chatModel?: string;
  /** 埋め込みモデル。省略時は `bge-m3` (DEFAULT_EMBED_MODEL)。 */
  embedModel?: string;
}

/**
 * Wave 3 (memory) のライフサイクルで **1 回だけ** open / attach / close する
 * memory-core DB セッション。全 memory analyzer がこのインスタンスを共有し、
 * 各 scope メソッドを呼ぶ (analyzer ごとに DB を open すると ATTACH 競合・性能劣化)。
 *
 * 各 scope メソッドは `run*Incremental` を呼ぶ薄いラッパで、cursor 管理
 * (`memory_pipeline_state`) は `run*Incremental` 内に閉じたまま。メソッドは
 * 内部で例外を捕捉し `ScopeResult.status==='error'` を返す (throw しない)。
 * 呼び出し側 (analyzer / runMemoryCorePipeline) が error を見て throw する。
 *
 * 注意: ファイルベースの open / attach / watchdog / backup は {@link openMemoryDbSession}
 * が担う。本クラスは open 済みハンドルを受け取るだけなので、テストは in-memory DB を
 * 直接渡せる。
 */
export class MemoryDbSession implements MemoryCoreScopeRunner {
  constructor(private readonly deps: MemoryDbSessionDeps) {}

  private get logger(): PipelineLogger {
    return this.deps.logger;
  }

  private get status(): PipelineStatusWriter | undefined {
    return this.deps.statusWriter;
  }

  private get repoName(): string {
    return path.basename(this.deps.gitRoot);
  }

  private save(): void {
    this.deps.memDb.save();
  }

  /** セッションを保存して閉じる。 */
  close(): void {
    this.deps.memDb.save();
    this.deps.memDb.close();
  }

  // ── conversation (backfill/incremental + failed-items retry) ────────────────
  async runConversation(opts: RunConversationOptions = {}): Promise<ScopeResult> {
    const { memDb, ollama, backfillDays, chatModel } = this.deps;
    const logger = this.logger;
    const sinceDays = backfillDays ?? DEFAULT_CONVERSATION_BACKFILL_DAYS;

    // backfill window 拡張検知: cursor を空にして backfill 経路に倒す
    try {
      const expansion = detectBackfillWindowExpansion({ db: memDb.db, sinceDays });
      if (expansion.shouldExpand) {
        logger.info(`Backfill window expanded — ${expansion.reason}`);
        memDb.db.run(
          `UPDATE memory_pipeline_state
              SET last_processed_at = ''
            WHERE scope IN ('conversation_backfill', 'conversation_incremental')`,
        );
      }
    } catch (err) {
      logger.error('Backfill window expansion detection failed (continuing)', err);
    }

    const stmt = memDb.db.prepare(
      `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`,
    );
    const stateRow = stmt.get('conversation_incremental');
    const lastProcessedAt = (stateRow?.['last_processed_at'] as string) ?? '';
    stmt.free?.();
    const isFirstRun = !lastProcessedAt;

    let convTotalEstimate = 0;
    try {
      const c = memDb.db.prepare(
        `SELECT COUNT(*) AS c FROM trail.messages WHERE timestamp >= ? AND type = 'user'`,
      );
      const countRow = c.get(lastProcessedAt || '1970-01-01T00:00:00.000Z');
      convTotalEstimate = (countRow?.['c'] as number) ?? 0;
      c.free?.();
    } catch {
      // ignore — pre-count は概算 ETA 用なので失敗しても処理続行
    }

    this.status?.start('conversation_incremental', convTotalEstimate || undefined);
    let convResult: ScopeResult;
    try {
      if (isFirstRun) {
        logger.info(`First run detected — running backfill (${sinceDays} days)`);
        const result = await runConversationBackfill({
          db: memDb.db,
          ollama,
          model: chatModel,
          sinceDays,
          logger,
          save: () => this.save(),
          onTotal: (total) => this.status?.start('conversation_incremental', total),
          progress: (processed, failed) =>
            this.status?.update('conversation_incremental', processed, failed),
          shouldStop: opts.shouldStop,
        });
        this.status?.finish('conversation_incremental', result.status, result.items_processed, result.items_failed);
        convResult = {
          scope: 'conversation_incremental',
          status: result.status,
          itemsProcessed: result.items_processed,
          itemsFailed: result.items_failed,
        };
      } else {
        logger.info(`Running incremental (since ${lastProcessedAt})`);
        const result = await runConversationIncremental({
          db: memDb.db,
          ollama,
          model: chatModel,
          logger,
          save: () => this.save(),
          progress: (processed, failed) =>
            this.status?.update('conversation_incremental', processed, failed),
          shouldStop: opts.shouldStop,
        });
        this.status?.finish('conversation_incremental', result.status, result.items_processed, result.items_failed);
        convResult = {
          scope: 'conversation_incremental',
          status: result.status,
          itemsProcessed: result.items_processed,
          itemsFailed: result.items_failed,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('conversation_incremental', 'error', 0, 0, msg);
      return { scope: 'conversation_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
    this.save();

    // throttle COOLING 中は failed-items retry も skip し、Wave 3 を次 scope へ進める。
    // cursor は incremental/backfill 側で据え置き済みなので次 run で続行する。
    if (opts.shouldStop?.()) {
      this.status?.finish('conversation_failed_items_retry', 'skipped', 0, 0);
      this.logger.info('runConversation: throttle COOLING — skipping failed-items retry');
      return convResult;
    }

    // failed-items retry
    this.status?.start('conversation_failed_items_retry');
    try {
      const retryResult = await runConversationFailedItemsRetry({
        db: memDb.db,
        ollama,
        model: chatModel,
        logger,
        save: () => this.save(),
      });
      this.status?.finish('conversation_failed_items_retry', retryResult.status, retryResult.items_retried, retryResult.items_failed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('conversation_failed_items_retry', 'error', 0, 0, msg);
      return { scope: 'conversation_failed_items_retry', status: 'error', itemsProcessed: convResult.itemsProcessed, itemsFailed: convResult.itemsFailed, error: msg };
    }
    this.save();
    return convResult;
  }

  // ── code (incremental + reconciliation, in-memory entity_ids 受け渡し) ───────
  async runCode(): Promise<ScopeResult> {
    const { memDb } = this.deps;
    const logger = this.logger;
    const gitRoot = this.deps.gitRoot;
    const tsconfigPath = process.env['MEMORY_CORE_TSCONFIG'] ?? path.join(gitRoot, 'tsconfig.json');
    const repoName = this.repoName;

    this.status?.start('code_incremental');
    let codeEntityIds = new Set<string>();
    let codeWasSkipped = false;
    let processed = 0;
    try {
      const codeResult = await runCodeIncremental({ db: memDb.db, repoName, tsconfigPath, gitRoot, logger });
      codeEntityIds = codeResult.current_entity_ids;
      codeWasSkipped = codeResult.status === 'skipped';
      processed = codeResult.items_processed;
      this.status?.finish('code_incremental', codeResult.status === 'skipped' ? 'skipped' : codeResult.status, codeResult.items_processed, 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('code_incremental', 'error', 0, 0, msg);
      return { scope: 'code_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
    this.save();

    // reconciliation: code_incremental が skipped なら entity_ids 空のため
    // 全 entity 誤 soft-delete を避けて reconciliation も skip する (ハード制約)。
    this.status?.start('code_reconciliation');
    try {
      if (codeWasSkipped) {
        this.status?.finish('code_reconciliation', 'skipped', 0, 0);
      } else {
        const reconResult = runCodeReconciliation({
          db: memDb.db,
          repoName,
          currentEntityIds: codeEntityIds,
          recordedAt: new Date().toISOString(),
          logger,
        });
        this.status?.finish('code_reconciliation', reconResult.status, reconResult.soft_deleted, 0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('code_reconciliation', 'error', 0, 0, msg);
      return { scope: 'code_reconciliation', status: 'error', itemsProcessed: processed, itemsFailed: 0, error: msg };
    }
    this.save();
    return { scope: 'code_incremental', status: codeWasSkipped ? 'skipped' : 'ok', itemsProcessed: processed, itemsFailed: 0 };
  }

  // ── bug history ─────────────────────────────────────────────────────────────
  async runBugHistory(): Promise<ScopeResult> {
    const { memDb } = this.deps;
    const logger = this.logger;
    this.status?.start('bug_history_incremental');
    try {
      const bugResult = await runBugHistoryIncremental({
        db: memDb.db,
        repoName: this.repoName,
        repoRoot: this.deps.gitRoot,
        logger,
      });
      this.status?.finish('bug_history_incremental', bugResult.status, bugResult.items_processed, 0);
      this.save();
      return { scope: 'bug_history_incremental', status: bugResult.status, itemsProcessed: bugResult.items_processed, itemsFailed: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('bug_history_incremental', 'error', 0, 0, msg);
      return { scope: 'bug_history_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
  }

  // ── review ──────────────────────────────────────────────────────────────────
  async runReview(): Promise<ScopeResult> {
    const { memDb, ollama } = this.deps;
    const logger = this.logger;
    const reviewDir = process.env['MEMORY_CORE_REVIEW_DIR'] ?? '/Shared/anytime-markdown-docs/review';
    const model = this.deps.chatModel ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';
    this.status?.start('review_incremental');
    try {
      const reviewResult = await runReviewIncremental({
        db: memDb.db,
        repoName: this.repoName,
        reviewDir,
        ollama,
        model,
        logger,
      });
      this.status?.finish('review_incremental', reviewResult.status, reviewResult.items_processed, 0);
      this.save();
      return { scope: 'review_incremental', status: reviewResult.status, itemsProcessed: reviewResult.items_processed, itemsFailed: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('review_incremental', 'error', 0, 0, msg);
      return { scope: 'review_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
  }

  // ── spec ──────────────────────────────────────────────────────────────────
  async runSpec(): Promise<ScopeResult> {
    const { memDb, ollama } = this.deps;
    const logger = this.logger;
    const specRoot = process.env['MEMORY_CORE_SPEC_DIR'] ?? '/Shared/anytime-markdown-docs/spec';
    const model = this.deps.chatModel ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';
    this.status?.start('spec_incremental');
    try {
      const specResult = await runSpecIncremental({ db: memDb.db, specRoot, ollama, model, logger });
      this.status?.finish('spec_incremental', specResult.status, specResult.items_processed, 0);
      this.save();
      return { scope: 'spec_incremental', status: specResult.status, itemsProcessed: specResult.items_processed, itemsFailed: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('spec_incremental', 'error', 0, 0, msg);
      return { scope: 'spec_incremental', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
  }

  // ── drift detection (純 SQL 多源照合) ───────────────────────────────────────
  async runDrift(): Promise<ScopeResult> {
    const { memDb } = this.deps;
    const logger = this.logger;
    this.status?.start('drift_detection');
    try {
      const driftResult = await runDriftDetection({ db: memDb.db, logger });
      this.status?.finish('drift_detection', driftResult.status, driftResult.events_inserted + driftResult.events_updated, 0);
      this.save();
      return {
        scope: 'drift_detection',
        status: driftResult.status,
        itemsProcessed: driftResult.events_inserted + driftResult.events_updated,
        itemsFailed: 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('drift_detection', 'error', 0, 0, msg);
      return { scope: 'drift_detection', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
  }

  // ── embedding backfill ──────────────────────────────────────────────────────
  async runEmbeddingBackfill(): Promise<ScopeResult> {
    const { memDb, ollama } = this.deps;
    const logger = this.logger;
    this.status?.start('embedding_backfill');
    try {
      const embedResult = await runEmbeddingBackfill({
        db: memDb.db,
        ollama,
        embedModel: this.deps.embedModel,
        logger,
        onTotal: (total) => this.status?.start('embedding_backfill', total),
        progress: (processed, failed) => this.status?.update('embedding_backfill', processed, failed),
      });
      this.status?.finish('embedding_backfill', embedResult.status, embedResult.items_processed, embedResult.items_failed);
      this.save();
      return {
        scope: 'embedding_backfill',
        status: embedResult.status,
        itemsProcessed: embedResult.items_processed,
        itemsFailed: embedResult.items_failed,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status?.finish('embedding_backfill', 'error', 0, 0, msg);
      return { scope: 'embedding_backfill', status: 'error', itemsProcessed: 0, itemsFailed: 0, error: msg };
    }
  }
}
