import type { CaravanDbConnection } from '../db/connection/types';
import { PipelineRunLedger } from './PipelineRunLedger';
import { splitEpisodes, type Message } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { ingestTargetSql } from '../ingest/conversation/messageFilter';
import { noopLogger, type CaravanLogger } from '../logger';
import type { MemoryWorkspaceScope } from '../ingest/workspaceScope';
import type { OllamaClient } from '@anytime-markdown/agent-core';

type PipelineStatus = 'success' | 'partial' | 'error';

const RETRY_SCOPE = 'conversation_failed_items_retry';
// Retry covers every conversation ingest scope that records extraction failures.
// Previously only 'conversation_backfill' was retried, leaving
// 'conversation_incremental' failures orphaned in caravan_failed_items forever.
const DEFAULT_SOURCE_SCOPES = ['conversation_incremental', 'conversation_backfill'] as const;
const DEFAULT_MAX_ATTEMPTS = 3;
const QUARANTINE_THRESHOLD = 3;
const PROGRESS_LOG_INTERVAL = 5;
const DEFAULT_EXTRACT_CONCURRENCY = 2;

function resolveMaxAttempts(): number {
  const raw = process.env['MEMORY_CORE_FAILED_RETRY_MAX'];
  if (raw === undefined || raw === '') return DEFAULT_MAX_ATTEMPTS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_ATTEMPTS;
  return Math.floor(n);
}

function resolveExtractConcurrency(): number {
  const raw = process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
  if (raw === undefined || raw === '') return DEFAULT_EXTRACT_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_EXTRACT_CONCURRENCY;
  return Math.floor(n);
}

interface FailedItemRow {
  scope: string;
  item_key: string;
  attempt_count: number;
}

interface ReconstructedEpisode {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

function loadFailedItems(db: CaravanDbConnection, sourceScopes: readonly string[], maxAttempts: number): FailedItemRow[] {
  // Guard: an empty scope list would produce a syntactically invalid `scope IN ()`.
  if (sourceScopes.length === 0) return [];
  const placeholders = sourceScopes.map(() => '?').join(', ');
  const rows = db.exec(
    `SELECT scope, item_key, attempt_count
     FROM caravan_failed_items
     WHERE scope IN (${placeholders}) AND reason IN ('extraction_failed', 'persist_failed', 'episode_not_found')
       AND attempt_count < ?
     ORDER BY failed_at ASC`,
    [...sourceScopes, maxAttempts]
  );
  if (rows.length === 0) return [];
  return (rows[0].values ?? []).map((r) => ({
    scope: r[0] as string,
    item_key: r[1] as string,
    attempt_count: r[2] as number,
  }));
}

function parseItemKey(item_key: string): { session_id: string; message_uuid_start: string } | null {
  // item_key format: "<session_id>:<message_uuid_start>" — both are UUIDs.
  const idx = item_key.indexOf(':');
  if (idx < 0) return null;
  return {
    session_id: item_key.slice(0, idx),
    message_uuid_start: item_key.slice(idx + 1),
  };
}

/**
 * 再構築の結果。「取込対象から外れた」を「失敗」と区別するために判別子を持つ。
 *
 * 両者を null で潰すと、取込条件を狭めた（sidechain 除外・本文ゼロ除外）ときに
 * 過去の失敗キーが必ず episode_not_found になり、3 件連続で並ぶだけで
 * QUARANTINE_THRESHOLD に触れて retry スコープ全体が止まる。
 */
type ReconstructOutcome =
  | { readonly kind: 'ok'; readonly episode: ReconstructedEpisode }
  /** activity.db に行はあるが、現在の取込条件では episode にならない（対象外）。 */
  | { readonly kind: 'out_of_scope' }
  /** activity.db にそもそも行が無い（データ欠落・キー破損）。 */
  | { readonly kind: 'not_found' };

/** 取込条件を外して当該メッセージが activity.db に実在するかを見る。 */
function messageExistsIgnoringFilter(
  db: CaravanDbConnection,
  session_id: string,
  message_uuid_start: string,
): boolean {
  const rows = db.exec(
    `SELECT 1 FROM trail.activity_messages WHERE session_id = ? AND uuid = ? LIMIT 1`,
    [session_id, message_uuid_start],
  );
  return (rows[0]?.values?.length ?? 0) > 0;
}

function reconstructEpisode(
  db: CaravanDbConnection,
  session_id: string,
  message_uuid_start: string,
  scope: MemoryWorkspaceScope,
): ReconstructOutcome {
  // ATTACHed trail DB から該当 session の messages を取得し、splitEpisodes で
  // 元 episode を再構築する。message_uuid_start が一致する episode を返す。
  const target = ingestTargetSql(scope, 'm');
  const rows = db.exec(
    `SELECT m.uuid, m.session_id, m.type, m.timestamp,
            COALESCE(SUBSTR(m.text_content, 1, 2048),
                     SUBSTR(m.user_content, 1, 2048),
                     '') AS text_excerpt
     FROM trail.activity_messages m
     WHERE m.session_id = ? AND m.timestamp IS NOT NULL
       AND ${target.sql}
     ORDER BY m.timestamp`,
    [session_id, ...target.params]
  );
  const notFoundOrOutOfScope = (): ReconstructOutcome =>
    messageExistsIgnoringFilter(db, session_id, message_uuid_start)
      ? { kind: 'out_of_scope' }
      : { kind: 'not_found' };

  if (rows.length === 0 || !rows[0].values || rows[0].values.length === 0) {
    return notFoundOrOutOfScope();
  }
  const messages: Message[] = [];
  for (const r of rows[0].values) {
    const t = r[2] as string;
    if (t !== 'user' && t !== 'assistant' && t !== 'system') continue;
    messages.push({
      uuid: r[0] as string,
      session_id: r[1] as string,
      type: t,
      timestamp: r[3] as string,
      text_excerpt: (r[4] as string | null) ?? '',
    });
  }
  const eps = splitEpisodes(messages);
  const found = eps.find((e) => e.message_uuid_start === message_uuid_start);
  return found ? { kind: 'ok', episode: found } : notFoundOrOutOfScope();
}

function deleteFailedItem(db: CaravanDbConnection, scope: string, item_key: string): void {
  db.run(
    `DELETE FROM caravan_failed_items WHERE scope = ? AND item_key = ?`,
    [scope, item_key]
  );
}

function recordFailedItem(
  db: CaravanDbConnection,
  scope: string,
  item_key: string,
  reason: string,
  detail: string,
): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       reason        = excluded.reason,
       detail        = excluded.detail`,
    [scope, item_key, failedAt, reason, detail]
  );
}

function upsertPipelineState(
  db: CaravanDbConnection,
  opts: { status: string; error_detail?: string },
): void {
  const { status, error_detail } = opts;
  db.run(
    `INSERT INTO caravan_pipeline_state
       (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, '', ?)
     ON CONFLICT(scope) DO UPDATE SET
       status       = excluded.status,
       error_detail = excluded.error_detail`,
    [RETRY_SCOPE, status, error_detail ?? '']
  );
}

type PartialReturnPayload = {
  status: 'partial';
  items_retried: number;
  items_recovered: number;
  items_failed: number;
};

/**
 * Sets quarantine pipeline state and returns the standard partial result.
 * Called when consecutiveFailures reaches QUARANTINE_THRESHOLD.
 */
function enterQuarantine(
  db: CaravanDbConnection,
  ledger: PipelineRunLedger,
  errorDetail: string,
  totals: PersistStats & { items_processed: number; items_failed: number },
  recoveredCount: number,
  logger: { error: (msg: string) => void },
): PartialReturnPayload {
  logger.error(
    `[anytime-memory] failed-items retry: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
  );
  upsertPipelineState(db, { status: 'quarantine', error_detail: errorDetail });
  ledger.finish('partial', totals, errorDetail);
  return {
    status: 'partial',
    items_retried: totals.items_processed,
    items_recovered: recoveredCount,
    items_failed: totals.items_failed,
  };
}

export interface FailedItemsRetryResult {
  status: 'success' | 'partial' | 'error';
  items_retried: number;
  items_recovered: number;
  items_failed: number;
}

/** 再試行の進行状態。集計と quarantine 判定の入力を 1 つに束ねる。 */
type RetryState = {
  totals: PersistStats & { items_processed: number; items_failed: number };
  recoveredCount: number;
  /** 取込対象から外れて台帳から落としたキーの数（失敗ではないが黙って消さない）。 */
  droppedCount: number;
  consecutiveFailures: number;
};

type ExtractedFacts = Awaited<ReturnType<typeof extractFactsFromEpisode>> | null;

/** 台帳項目 1 件の処理結果。呼び出し側のループ制御へ返すのは quarantine 到達のみ。 */
type RetryItemSignal =
  | { kind: 'continue' }
  | { kind: 'quarantine'; errorDetail: string };

/** バッチ内の item_key から episode を再構築する（同期・DB のみ）。 */
function reconstructBatch(
  db: CaravanDbConnection,
  batch: FailedItemRow[],
  scope: MemoryWorkspaceScope,
): ReconstructOutcome[] {
  return batch.map((item) => {
    const parsed = parseItemKey(item.item_key);
    if (!parsed) return { kind: 'not_found' };
    return reconstructEpisode(db, parsed.session_id, parsed.message_uuid_start, scope);
  });
}

/** バッチ内の episode を並行に LLM 抽出する。1 件の失敗は null にして他を止めない。 */
async function extractBatchFacts(args: {
  ollama: OllamaClient;
  model: string | undefined;
  batch: FailedItemRow[];
  outcomes: ReconstructOutcome[];
  logger: CaravanLogger;
}): Promise<ExtractedFacts[]> {
  const { ollama, model, batch, outcomes, logger } = args;
  return Promise.all(
    batch.map(async (item, i) => {
      const outcome = outcomes[i];
      if (outcome.kind !== 'ok') return null;
      const ep = outcome.episode;
      try {
        return await extractFactsFromEpisode({
          ollama,
          episode: ep,
          model,
          logger,
        });
      } catch (err) {
        logger.error(
          `[anytime-memory] failed-items retry: extractFactsFromEpisode error for ${item.item_key}`,
          err
        );
        return null;
      }
    })
  );
}

/**
 * 台帳項目 1 件を再試行し、集計へ反映する。
 * quarantine 到達時のみ signal で返す（pipeline_state 更新と ledger 確定は呼び出し側）。
 */
function retryOneItem(args: {
  db: CaravanDbConnection;
  item: FailedItemRow;
  reconstructed: { outcome: ReconstructOutcome; ex: ExtractedFacts };
  state: RetryState;
  logger: CaravanLogger;
}): RetryItemSignal {
  const { db, item, state, logger } = args;
  const { outcome, ex } = args.reconstructed;
  const { totals } = state;

  // Case 0: 取込対象から外れたキー (sidechain / 本文ゼロ)。失敗ではないので
  // 台帳から落とすだけにし、連続失敗カウンタを進めない。ここを失敗として
  // 数えると、取込条件を狭めた直後に retry スコープが quarantine で止まる。
  if (outcome.kind === 'out_of_scope') {
    state.droppedCount += 1;
    deleteFailedItem(db, item.scope, item.item_key);
    state.consecutiveFailures = 0;
    return { kind: 'continue' };
  }

  // Case 1: episode could not be reconstructed (activity.db missing data, malformed key)
  if (outcome.kind === 'not_found') {
    totals.items_failed += 1;
    state.consecutiveFailures += 1;
    recordFailedItem(db, item.scope, item.item_key, 'episode_not_found',
      `episode not reconstructed from activity.db for ${item.item_key}`);
    if (state.consecutiveFailures >= QUARANTINE_THRESHOLD) {
      return { kind: 'quarantine', errorDetail: `${QUARANTINE_THRESHOLD} consecutive failures` };
    }
    return { kind: 'continue' };
  }

  // Case 2: extraction returned null (LLM failure, schema violation)
  if (ex === null) {
    totals.items_failed += 1;
    state.consecutiveFailures += 1;
    recordFailedItem(db, item.scope, item.item_key, 'extraction_failed',
      `retry attempt ${item.attempt_count + 1} failed`);
    if (state.consecutiveFailures >= QUARANTINE_THRESHOLD) {
      return {
        kind: 'quarantine',
        errorDetail: `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
      };
    }
    return { kind: 'continue' };
  }

  // Case 3: extraction succeeded → persist + remove from failed_items
  state.consecutiveFailures = 0;
  const recordedAt = new Date().toISOString();
  try {
    const persisted = persistEpisodeFacts({
      db,
      episode: outcome.episode,
      extracted: ex,
      recordedAt,
      logger,
    });
    totals.entities_inserted += persisted.entities_inserted;
    totals.entities_updated += persisted.entities_updated;
    totals.entities_suppressed += persisted.entities_suppressed;
    totals.edges_inserted += persisted.edges_inserted;
    totals.edges_invalidated += persisted.edges_invalidated;
    totals.edges_suppressed += persisted.edges_suppressed;
    deleteFailedItem(db, item.scope, item.item_key);
    state.recoveredCount += 1;
  } catch (err) {
    logger.error(
      `[anytime-memory] failed-items retry: persist failed for ${item.item_key}`,
      err
    );
    totals.items_failed += 1;
    recordFailedItem(
      db,
      item.scope,
      item.item_key,
      'persist_failed',
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
  }
  return { kind: 'continue' };
}

/**
 * 台帳項目をバッチ単位で再試行する。
 *
 * 抽出は LLM I/O バウンドのため並行、永続化は sql.js が単一スレッドの WASM で
 * スレッドセーフでないため直列（バッチ内は 1 件ずつ）。quarantine 到達時のみ
 * partial の戻り値を返し、それ以外は null（＝全件処理完了）。
 */
async function retryFailedItemBatches(args: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  model: string | undefined;
  items: FailedItemRow[];
  extractConcurrency: number;
  ledger: PipelineRunLedger;
  state: RetryState;
  save: (() => void) | undefined;
  logger: CaravanLogger;
  workspaceScope: MemoryWorkspaceScope;
}): Promise<PartialReturnPayload | null> {
  const { db, ollama, model, items, extractConcurrency, ledger, state, save, logger } = args;
  const { totals } = state;

  for (let batchStart = 0; batchStart < items.length; batchStart += extractConcurrency) {
    const batch = items.slice(batchStart, batchStart + extractConcurrency);

    const outcomes = reconstructBatch(db, batch, args.workspaceScope);
    const extracted = await extractBatchFacts({ ollama, model, batch, outcomes, logger });

    for (let j = 0; j < batch.length; j++) {
      totals.items_processed += 1;

      if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `[anytime-memory] failed-items retry progress: ${totals.items_processed}/${items.length}`
        );
        ledger.heartbeat(totals);
        save?.();
      }

      const signal = retryOneItem({
        db,
        item: batch[j],
        reconstructed: { outcome: outcomes[j], ex: extracted[j] },
        state,
        logger,
      });
      if (signal.kind === 'quarantine') {
        return enterQuarantine(
          db, ledger, signal.errorDetail, totals, state.recoveredCount, logger,
        );
      }
    }
  }
  return null;
}

/**
 * Re-runs LLM extraction on previously failed episodes recorded in
 * caravan_failed_items. Each item_key is split into (session_id, message_uuid_start),
 * the original episode is reconstructed from the ATTACHed activity.db, and the
 * extraction is retried. On success the failed_items row is DELETEd; on failure
 * attempt_count is incremented (existing ON CONFLICT path).
 *
 * Items with attempt_count >= maxAttempts (default 3) are skipped — they require
 * human intervention.
 *
 * The ATTACHed activity.db must already be present as alias "trail" before calling.
 */
export async function runConversationFailedItemsRetry(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  /**
   * 取込対象ワークスペース。取込本体と同じ条件で再構築しないと、限定の外に出た
   * 過去の失敗キーが `not_found`（＝失敗）に見え、3 件並ぶだけで retry スコープが
   * quarantine で止まる。
   */
  workspaceScope: MemoryWorkspaceScope;
  logger?: CaravanLogger;
  model?: string;
  maxAttempts?: number;
  /** Single source scope. Deprecated: prefer `sourceScopes`. */
  sourceScope?: string;
  /** Conversation ingest scopes to retry. Defaults to incremental + backfill. */
  sourceScopes?: readonly string[];
  save?: () => void;
}): Promise<FailedItemsRetryResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const maxAttempts = opts.maxAttempts ?? resolveMaxAttempts();
  // Items from all source scopes are retried in one run, ordered by failed_at.
  // consecutiveFailures (quarantine) is therefore counted across scopes by design:
  // a burst of failures in either scope quarantines the whole run, which is
  // released on the next run. This is intentional — quarantine guards the shared
  // Ollama extraction path, not a single scope.
  const sourceScopes =
    opts.sourceScopes ??
    (opts.sourceScope !== undefined ? [opts.sourceScope] : DEFAULT_SOURCE_SCOPES);
  const sourceLabel = sourceScopes.join(',');
  const extractConcurrency = resolveExtractConcurrency();

  const startedAt = new Date().toISOString();
  const ledger = new PipelineRunLedger({ db, scope: RETRY_SCOPE, wave: 'memory', tier: 3, logger });

  ledger.start(startedAt);
  upsertPipelineState(db, { status: 'running' });

  const items = loadFailedItems(db, sourceScopes, maxAttempts);
  const totals: PersistStats & { items_processed: number; items_failed: number } = {
    items_processed: 0,
    entities_inserted: 0,
    entities_updated: 0,
    entities_suppressed: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    edges_suppressed: 0,
    items_failed: 0,
  };
  const state: RetryState = {
    totals,
    recoveredCount: 0,
    droppedCount: 0,
    consecutiveFailures: 0,
  };
  let finalStatus: 'success' | 'partial' | 'error' = 'success';

  if (items.length === 0) {
    logger.info(
      `[anytime-memory] failed-items retry: no items to retry (source=${sourceLabel}, maxAttempts=${maxAttempts})`
    );
    upsertPipelineState(db, { status: 'idle' });
    ledger.finish('success', totals);
    return { status: 'success', items_retried: 0, items_recovered: 0, items_failed: 0 };
  }

  logger.info(
    `[anytime-memory] failed-items retry: ${items.length} items to retry (source=${sourceLabel})`
  );

  try {
    const quarantined = await retryFailedItemBatches({
      db, ollama, model, items, extractConcurrency, ledger, state, save, logger,
      workspaceScope: opts.workspaceScope,
    });
    if (quarantined !== null) return quarantined;
  } catch (err) {
    logger.error(`[anytime-memory] failed-items retry: fatal error during iteration`, err);
    finalStatus = 'error';
    upsertPipelineState(db, {
      status: 'error',
      error_detail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    ledger.fail(err, totals);
    return {
      status: finalStatus,
      items_retried: totals.items_processed,
      items_recovered: state.recoveredCount,
      items_failed: totals.items_failed,
    };
  }

  upsertPipelineState(db, { status: 'idle' });
  ledger.finish(finalStatus, totals);

  logger.info(
    `[anytime-memory] failed-items retry: retried=${totals.items_processed} ` +
      `recovered=${state.recoveredCount} failed=${totals.items_failed} ` +
      `dropped_out_of_scope=${state.droppedCount}`
  );

  return {
    status: finalStatus,
    items_retried: totals.items_processed,
    items_recovered: state.recoveredCount,
    items_failed: totals.items_failed,
  };
}
