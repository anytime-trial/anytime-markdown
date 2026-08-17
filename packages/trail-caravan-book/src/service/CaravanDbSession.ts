import * as path from 'node:path';

import type { OllamaClient } from '@anytime-markdown/agent-core';

import type { CaravanBookDb } from '../db/connection';
import {
  DEFAULT_CONVERSATION_BACKFILL_DAYS,
  runConversationBackfill,
} from '../pipeline/runConversationBackfill';
import { detectBackfillWindowExpansion } from '../pipeline/detectBackfillWindowExpansion';
import { ingestableMessageSql } from '../ingest/conversation/messageFilter';
import {
  resolveWorkspaceScope,
  type MemoryWorkspaceScope,
  type WorkspaceScopeMode,
} from '../ingest/workspaceScope';
import { runConversationIncremental } from '../pipeline/runConversationIncremental';
import { runConversationFailedItemsRetry } from '../pipeline/runConversationFailedItemsRetry';
import { runCodeIncremental } from '../pipeline/runCodeIncremental';
import { runCodeReconciliation } from '../pipeline/runCodeReconciliation';
import { runBugHistoryIncremental } from '../pipeline/runBugHistoryIncremental';
import { runReviewIncremental } from '../pipeline/runReviewIncremental';
import { runReviewBackfill } from '../pipeline/runReviewBackfill';
import { runSpecIncremental } from '../pipeline/runSpecIncremental';
import { runSpecReconciliation } from '../pipeline/runSpecReconciliation';
import { runDriftDetection } from '../pipeline/runDriftDetection';
import { runEmbeddingBackfill } from '../pipeline/runEmbeddingBackfill';
import type { PipelineStatusWriter } from '../status/PipelineStatusWriter';
import type { PipelineLogger } from './types';

/**
 * trail-caravan-book の 1 scope 実行結果。`run*Incremental` の `status` をそのまま伝播し、
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
 * trail-caravan-book の 9 pipeline scope を 7 ドメインメソッドにグルーピングした実行 API。
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

export interface CaravanBookScopeRunner {
  runConversation(opts?: RunConversationOptions): Promise<ScopeResult>;
  runCode(): Promise<ScopeResult>;
  runBugHistory(): Promise<ScopeResult>;
  runReview(): Promise<ScopeResult>;
  runSpec(): Promise<ScopeResult>;
  runDrift(): Promise<ScopeResult>;
  runEmbeddingBackfill(): Promise<ScopeResult>;
}

export interface CaravanDbSessionDeps {
  /** open 済み trail-caravan-book DB (activity.db を ATTACH 済みであること)。 */
  memDb: CaravanBookDb;
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
  /**
   * activity.db から記憶へ昇格させる対象ワークスペース (lep.json `memory.workspaceScope`)。
   *
   * `import_sessions` は `~/.claude/projects/` 配下の全プロジェクトを取り込むため、
   * activity.db には他ワークスペースのセッションも入っている。既定の `'own'` は
   * `basename(gitRoot)` に一致するリポジトリのセッションだけを記憶へ入れる
   * (code / bug history / review が既に使っている repoName と同じ値)。
   */
  workspaceScopeMode?: WorkspaceScopeMode;
}

/**
 * Wave 3 (memory) のライフサイクルで **1 回だけ** open / attach / close する
 * trail-caravan-book DB セッション。全 memory analyzer がこのインスタンスを共有し、
 * 各 scope メソッドを呼ぶ (analyzer ごとに DB を open すると ATTACH 競合・性能劣化)。
 *
 * 各 scope メソッドは `run*Incremental` を呼ぶ薄いラッパで、cursor 管理
 * (`caravan_pipeline_state`) は `run*Incremental` 内に閉じたまま。メソッドは
 * 内部で例外を捕捉し `ScopeResult.status==='error'` を返す (throw しない)。
 * 呼び出し側 (analyzer / runCaravanBookPipeline) が error を見て throw する。
 *
 * 注意: ファイルベースの open / attach / watchdog / backup は {@link openCaravanDbSession}
 * が担う。本クラスは open 済みハンドルを受け取るだけなので、テストは in-memory DB を
 * 直接渡せる。
 */
export class CaravanDbSession implements CaravanBookScopeRunner {
  constructor(private readonly deps: CaravanDbSessionDeps) {}

  private get logger(): PipelineLogger {
    return this.deps.logger;
  }

  private get status(): PipelineStatusWriter | undefined {
    return this.deps.statusWriter;
  }

  private get repoName(): string {
    return path.basename(this.deps.gitRoot);
  }

  /**
   * 会話・レビュー会話の取込対象ワークスペース。
   *
   * 未指定を `'own'` へ倒すのは、activity.db が複数ワークスペース分を持つ器であり、
   * 「設定を書き忘れた」が「他ワークスペースの会話まで記憶へ入る」を意味しないように
   * するため（広い側を既定にすると、限定の意図が配線 1 本の欠落で無言に消える）。
   */
  private get workspaceScope(): MemoryWorkspaceScope {
    return resolveWorkspaceScope(this.deps.workspaceScopeMode ?? 'own', this.repoName);
  }

  /**
   * 解決したスコープを 1 行ログする。
   *
   * repoName は `basename(gitRoot)` で、gitRoot が渡らない経路では `basename(cwd)` に
   * なる（openCaravanDbSession のフォールバック）。`ownWorkspaceScope` は空文字しか
   * 弾けないので、**非空だが実在しない repo 名**は素通りし、取込が恒久的に 0 件になっても
   * エラーもログも出ない。解決値と、0 件だった場合の実在 repo 一覧を出して、
   * 「限定した結果 0 件」と「配線ミスで 0 件」を人が区別できるようにする。
   */
  private logWorkspaceScope(scope: MemoryWorkspaceScope, targetCount: number): void {
    if (scope.kind === 'all_workspaces') {
      this.logger.info('[anytime-memory] workspace scope: all（全ワークスペースを取り込む）');
      return;
    }
    this.logger.info(
      `[anytime-memory] workspace scope: own (repo=${scope.repoName}, 対象 ${targetCount} 件)`,
    );
    if (targetCount > 0) return;
    try {
      const rows = this.deps.memDb.db.exec(
        `SELECT r.repo_name FROM trail.activity_repos r ORDER BY r.repo_name`,
      );
      const known = (rows[0]?.values ?? []).map((row) => String(row[0])).join(', ');
      this.logger.error(
        `[anytime-memory] workspace scope: repo="${scope.repoName}" に一致する取込対象が 0 件。` +
          `activity.db に実在する repo: [${known}]（gitRoot の指定を確認すること）`,
      );
    } catch (err) {
      this.logger.error('[anytime-memory] workspace scope: repo 一覧の取得に失敗', err);
    }
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
    const workspaceScope = this.workspaceScope;

    // backfill window 拡張検知: cursor を空にして backfill 経路に倒す
    try {
      const expansion = detectBackfillWindowExpansion({ db: memDb.db, sinceDays, workspaceScope });
      if (expansion.shouldExpand) {
        logger.info(`Backfill window expanded — ${expansion.reason}`);
        // scope は列挙で絞る。'review_body_backfill' はここでは last_processed_at が
        // 前進カーソルではなく一回限りの完了印なので、含めると是正が黙って再実行される
        // （runReviewBackfillOnce の docstring 参照）。
        memDb.db.run(
          `UPDATE caravan_pipeline_state
              SET last_processed_at = ''
            WHERE scope IN ('conversation_backfill', 'conversation_incremental')`,
        );
      }
    } catch (err) {
      logger.error('Backfill window expansion detection failed (continuing)', err);
    }

    const stmt = memDb.db.prepare(
      `SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?`,
    );
    const stateRow = stmt.get('conversation_incremental');
    const lastProcessedAt = (stateRow?.['last_processed_at'] as string) ?? '';
    stmt.free?.();
    const isFirstRun = !lastProcessedAt;

    let convTotalEstimate = 0;
    try {
      // ETA の分母は「エピソードになり得る user 行」で数える（取込側と同じ定義）。
      const ingestable = ingestableMessageSql(workspaceScope);
      const c = memDb.db.prepare(
        `SELECT COUNT(*) AS c FROM trail.activity_messages
          WHERE timestamp >= ? AND ${ingestable.sql}`,
      );
      const countRow = c.get(
        lastProcessedAt || '1970-01-01T00:00:00.000Z',
        ...ingestable.params,
      );
      convTotalEstimate = (countRow?.['c'] as number) ?? 0;
      c.free?.();
    } catch (err) {
      // 概算 ETA 用なので処理は続行するが、無言で 0 に縮退させない。
      // activity.db のスキーマ不整合（列欠落）はここが最初に踏む場所になり得る。
      logger.error(
        '[anytime-memory] conversation pre-count failed — ETA 分母を 0 として続行する',
        err,
      );
    }

    this.logWorkspaceScope(workspaceScope, convTotalEstimate);
    this.status?.start('conversation_incremental', convTotalEstimate || undefined);
    let convResult: ScopeResult;
    try {
      if (isFirstRun) {
        logger.info(`First run detected — running backfill (${sinceDays} days)`);
        const result = await runConversationBackfill({
          db: memDb.db,
          ollama,
          workspaceScope,
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
          workspaceScope,
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
        workspaceScope,
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
    let codeEntityIds: Set<string>;
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

    // reconciliation: entity_ids が空なら全 entity 誤 soft-delete になるため skip する
    // (ハード制約)。status==='skipped' だけを見ていると、ingestAstFacts が実行できず
    // entity_ids が空のまま status が success / partial になる経路（TrailGraph 欠落）を
    // 素通りさせるため、集合そのものを条件にする。
    const reconciliationUnsafe = codeWasSkipped || codeEntityIds.size === 0;
    this.status?.start('code_reconciliation');
    try {
      if (reconciliationUnsafe) {
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
  /**
   * runReviewBackfill を 1 回だけ実行する。
   *
   * 完了印は caravan_pipeline_state の専用スコープに置く。毎回走らせないのは、
   * 全期間のメッセージ再走査が数十秒かかるため。失敗しても取込本体は止めない
   * （是正は次回に持ち越せる）。
   */
  private runReviewBackfillOnce(): void {
    const { memDb } = this.deps;
    // **本スコープに限り** last_processed_at は前進カーソルではなく一回限りの完了印。
    // 他スコープ（conversation_* / spec_incremental / rag_fts_rebuild 等）では
    // 「一度でも走った時刻」で、毎回更新される。同じ列に逆の意味を載せているため、
    // last_processed_at を一括操作する処理（例: 本ファイルの backfill window 拡張検知）へ
    // 本スコープを含めてはならない（含めると是正が黙って再実行される）。
    // status に専用値を足さないのは CHECK が idle/running/quarantine/error のため。
    // scope 自体は migration 021 で CHECK へ追加済み。
    //
    // 再実行したいときは `DELETE FROM caravan_pipeline_state WHERE scope='review_body_backfill'`。
    // runReviewBackfill は冪等（空欄のみ補完・削除は対象消滅で 0 件）なので再実行は安全。
    const scope = 'review_body_backfill';
    const stmt = memDb.db.prepare(
      'SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?',
    );
    let done = false;
    try {
      done = String(stmt.get(scope)?.['last_processed_at'] ?? '') !== '';
    } finally {
      stmt.free?.();
    }
    if (done) return;

    const recordedAt = new Date().toISOString();
    try {
      const result = runReviewBackfill({ db: memDb.db, recordedAt, logger: this.logger });
      if (result.status !== 'success') {
        this.logger.error(
          `[${recordedAt}] [ERROR] [anytime-memory] runReviewBackfillOnce: ${result.error_detail}`,
        );
        return;
      }
      // 走査対象が 0 件のときは印を打たない。activity.db の差し替え直後・取込ラグ中は
      // ブロックが 0 件で「成功」を返すため、ここで印を打つと**何も是正しないまま
      // 一回限りの機会を消費**し、旧行が永久に空のまま残る（失敗ではないのでログにも
      // 出ない）。次回へ持ち越す。
      if (result.parsed_blocks === 0) {
        this.logger.info(
          `[${recordedAt}] [INFO] [anytime-memory] runReviewBackfillOnce: ` +
            `走査対象 0 件のため完了印を保留（次回再試行）`,
        );
        return;
      }
      memDb.db.run(
        `INSERT INTO caravan_pipeline_state (scope, status, last_processed_at, error_detail)
         VALUES (?, 'idle', ?, '')
         ON CONFLICT(scope) DO UPDATE SET last_processed_at = excluded.last_processed_at`,
        [scope, recordedAt],
      );
      this.logger.info(
        `[${recordedAt}] [INFO] [anytime-memory] runReviewBackfillOnce: ` +
          `bodies_filled=${result.bodies_filled} shells_removed=${result.shells_removed}`,
      );
    } catch (err) {
      this.logger.error(
        `[${recordedAt}] [ERROR] [anytime-memory] runReviewBackfillOnce: 失敗（取込は継続）`,
        err,
      );
    }
  }

  async runReview(): Promise<ScopeResult> {
    const { memDb, ollama } = this.deps;
    const logger = this.logger;
    const reviewDir = process.env['MEMORY_CORE_REVIEW_DIR'] ?? '/Shared/anytime-markdown-docs/review';
    const model = this.deps.chatModel ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';
    this.status?.start('review_incremental');
    try {
      // カーソルより古い session review 行の是正。runReviewIncremental は
      // last_processed_at 以降しか読まないため、過去行はこの経路でしか埋まらない。
      // 1 回で収束するので、完了を pipeline_state に記録して以後は走らせない。
      this.runReviewBackfillOnce();

      const reviewResult = await runReviewIncremental({
        db: memDb.db,
        repoName: this.repoName,
        workspaceScope: this.workspaceScope,
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
      // 取込（追加・更新）の後に削除側を突き合わせる。discoverChangedSpecs は今ある
      // ファイルしか見ないため、これが無いと消えた設計書の行が永久に残る。
      const reconResult = runSpecReconciliation({
        db: memDb.db,
        specRoot,
        recordedAt: new Date().toISOString(),
        logger,
      });
      // 掃除の失敗を握り潰さない。ログ 1 行に留めると、specRoot が読めない状態が
      // 何か月続いてもパイプラインは success を報告し続け、観測面に現れない。
      const scopeStatus = reconResult.status === 'error' ? 'error' : specResult.status;
      if (reconResult.status === 'error') {
        logger.error(
          `[${new Date().toISOString()}] [ERROR] [anytime-memory] runSpec: reconciliation failed — ${reconResult.error_detail}`,
        );
      }
      this.status?.finish(
        'spec_incremental',
        scopeStatus,
        specResult.items_processed,
        0,
        reconResult.status === 'error' ? reconResult.error_detail : undefined,
      );
      this.save();
      return {
        scope: 'spec_incremental',
        status: scopeStatus,
        itemsProcessed: specResult.items_processed,
        itemsFailed: 0,
        ...(reconResult.status === 'error' ? { error: reconResult.error_detail } : {}),
      };
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
      // 対象ファイル実在ゲート用の resolver。この daemon が管理するのは gitRoot の
      // 1 リポジトリだけなので、repoName 一致以外は null（= 実在チェックせず fail-open）。
      const gitRoot = this.deps.gitRoot;
      const repoName = this.repoName;
      const driftResult = await runDriftDetection({
        db: memDb.db,
        logger,
        resolveRepoRoot: (repo) => (repo === repoName ? gitRoot : null),
      });
      // reopen（再発）も処理件数に含める。除くと再発だけの実行が 0 件処理に見える。
      const driftProcessed =
        driftResult.events_inserted + driftResult.events_updated + driftResult.events_reopened;
      this.status?.finish('drift_detection', driftResult.status, driftProcessed, 0);
      this.save();
      return {
        scope: 'drift_detection',
        status: driftResult.status,
        itemsProcessed: driftProcessed,
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
