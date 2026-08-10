import type { CaravanDbConnection } from '../db/connection/types';
import { PipelineRunLedger } from './PipelineRunLedger';
import { splitEpisodes } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { readMessagesSince } from '../ingest/conversation/readMessages';
import { episodeId, persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { noopLogger, type CaravanLogger } from '../logger';
import type { OllamaClient } from '@anytime-markdown/agent-core';

type PipelineStatus = 'success' | 'partial' | 'error';

const SCOPE = 'conversation_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const QUARANTINE_THRESHOLD = 3;
const PROGRESS_LOG_INTERVAL = 50;

export interface IncrementalResult {
  status: PipelineStatus;
  items_processed: number;
  items_skipped: number;
  entities_inserted: number;
  entities_updated: number;
  entities_suppressed: number;
  edges_inserted: number;
  edges_invalidated: number;
  edges_suppressed: number;
  items_failed: number;
}

function readPipelineState(db: CaravanDbConnection): {
  last_processed_at: string;
  status: string;
} {
  const stmt = db.prepare(
    `SELECT last_processed_at, status FROM caravan_pipeline_state WHERE scope = ?`
  );
  try {
    const row = stmt.get(SCOPE);
    if (row) {
      return {
        last_processed_at: (row['last_processed_at'] as string) || DEFAULT_SINCE,
        status: (row['status'] as string) || 'idle',
      };
    }
    return { last_processed_at: DEFAULT_SINCE, status: 'idle' };
  } finally {
    stmt.free?.();
  }
}

function upsertPipelineState(
  db: CaravanDbConnection,
  opts: {
    status: string;
    last_processed_at?: string;
    error_detail?: string;
  }
): void {
  const { status, last_processed_at, error_detail } = opts;
  db.run(
    `INSERT INTO caravan_pipeline_state
       (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail      = excluded.error_detail`,
    [SCOPE, status, last_processed_at ?? '', error_detail ?? '']
  );
}

function recordFailedItem(db: CaravanDbConnection, itemKey: string, reason: string, detail: string): void {
  const failedAt = new Date().toISOString();
  db.run(
    `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [SCOPE, itemKey, failedAt, reason, detail]
  );
}

type EpisodeProcessResult =
  | { outcome: 'skipped' }
  | { outcome: 'quarantine'; quarantineCursor: string }
  | { outcome: 'failed' }
  | { outcome: 'persisted'; stats: PersistStats };

/**
 * Processes a single episode: extract facts, persist, or record failure.
 * Returns a typed outcome so the caller can update totals and decide whether
 * to quarantine without duplicating the quarantine-logic branching.
 */
async function processEpisode(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  episode: ReturnType<typeof splitEpisodes>[number];
  epId: string;
  existingIds: Set<string>;
  model: string | undefined;
  recordedAt: string;
  consecutiveFailures: number;
  logger: CaravanLogger;
}): Promise<EpisodeProcessResult> {
  const { db, ollama, episode, epId, existingIds, model, recordedAt, consecutiveFailures, logger } = opts;

  if (existingIds.has(epId)) return { outcome: 'skipped' };

  let extracted;
  try {
    extracted = await extractFactsFromEpisode({
      ollama,
      episode: {
        raw_excerpt: episode.raw_excerpt,
        session_id: episode.session_id,
        message_uuid_start: episode.message_uuid_start,
        message_uuid_end: episode.message_uuid_end,
        valid_from: episode.valid_from,
      },
      model,
      logger,
    });
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationIncremental: unexpected error in extractFacts for episode ${episode.message_uuid_start}`,
      err
    );
    extracted = null;
  }

  if (extracted === null) {
    recordFailedItem(
      db,
      `${episode.session_id}:${episode.message_uuid_start}`,
      'extraction_failed',
      `episode ${episode.message_uuid_start} in session ${episode.session_id}`
    );
    const newConsecutive = consecutiveFailures + 1;
    if (newConsecutive >= QUARANTINE_THRESHOLD) {
      const quarantineCursor = new Date(
        new Date(episode.valid_from).getTime() + 1
      ).toISOString();
      return { outcome: 'quarantine', quarantineCursor };
    }
    return { outcome: 'failed' };
  }

  try {
    const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt, logger });
    return { outcome: 'persisted' as const, stats };
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationIncremental: persist failed for episode ${episode.message_uuid_start}`,
      err
    );
    recordFailedItem(
      db,
      `${episode.session_id}:${episode.message_uuid_start}`,
      'persist_failed',
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
    return { outcome: 'failed' };
  }
}

/**
 * Incremental pipeline that reads new messages from the ATTACHed trail DB,
 * splits them into episodes, runs LLM extraction, and persists facts.
 *
 * The trail DB must already be ATTACHed as "trail" on `db` via
 * attachTrailDbFromHandle / attachTrailDbReadOnly before calling this function.
 */
/** セッション 1 件を処理した結果。呼び出し側のループ制御を戻り値へ写したもの。 */
type IncrementalSignal =
  | { kind: 'continue' }
  /** quarantine 到達。cursor を据えて partial で返す。 */
  | { kind: 'quarantine'; cursor: string }
  /** Ollama throttle COOLING による中断。cursor は据え置き。 */
  | { kind: 'stopped' };

interface IncrementalContext {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  model: string | undefined;
  logger: CaravanLogger;
  ledger: PipelineRunLedger;
  save: (() => void) | undefined;
  progress: ((processed: number, failed: number) => void) | undefined;
  shouldStop: (() => boolean) | undefined;
  /** processEpisode が可変 Set を要求するため ReadonlySet にはしない。 */
  existingIds: Set<string>;
}

interface IncrementalState {
  totals: PersistStats & { items_processed: number; items_skipped: number; items_failed: number };
  maxTimestamp: string;
  consecutiveFailures: number;
}

/**
 * 既に caravan_episodes にある episode id を先読みする。
 *
 * 前回 run が中断（VS Code reload）されたとき persistEpisodeFacts は冪等だが
 * extractFactsFromEpisode はそうではない。永続化済み episode を Ollama へ
 * 再投入すると 1 件あたり数分を無駄にするため、ここで skip する。
 */
function preloadExistingEpisodeIds(db: CaravanDbConnection, sinceISO: string): Set<string> {
  const existingIds = new Set<string>();
  const existsRows = db.exec(`SELECT id FROM caravan_episodes WHERE valid_from >= ?`, [sinceISO]);
  for (const row of existsRows[0]?.values ?? []) {
    existingIds.add(row[0] as string);
  }
  return existingIds;
}

/** 進捗ログ・heartbeat・disk 保存のチェックポイント。 */
function checkpointProgress(ctx: IncrementalContext, state: IncrementalState): void {
  const { totals } = state;
  ctx.logger.info(
    `[anytime-memory] conversation incremental progress: ${totals.items_processed} processed ` +
      `(${totals.items_failed} failed, ${totals.items_skipped} skipped, ` +
      `entities_inserted=${totals.entities_inserted})`
  );
  // Persist items_processed (and other run counters) to DB BEFORE
  // save() so the disk snapshot reflects the checkpoint. Cursor
  // advancement happens at session boundary, not here, because
  // session_id ordering ≠ timestamp ordering (UUIDs) — advancing
  // mid-session could skip ahead of later-iterated sessions with
  // earlier timestamps.
  ctx.ledger.heartbeat(totals);
  if (ctx.save) {
    const t0 = Date.now();
    ctx.save();
    ctx.logger.info(`[anytime-memory] conversation incremental: checkpoint save ${Date.now() - t0}ms`);
  }
}

/** episode 1 件を処理し集計へ反映する。quarantine 到達時のみ cursor を返す。 */
async function runIncrementalEpisode(
  episode: ReturnType<typeof splitEpisodes>[number],
  ctx: IncrementalContext,
  state: IncrementalState,
): Promise<{ quarantineCursor: string } | null> {
  const { totals } = state;
  const result = await processEpisode({
    db: ctx.db,
    ollama: ctx.ollama,
    episode,
    epId: episodeId(episode.session_id, episode.message_uuid_start),
    existingIds: ctx.existingIds,
    model: ctx.model,
    recordedAt: new Date().toISOString(),
    consecutiveFailures: state.consecutiveFailures,
    logger: ctx.logger,
  });

  if (result.outcome === 'skipped') {
    totals.items_skipped += 1;
    return null;
  }

  totals.items_processed += 1;

  // UI 通知は毎エピソード発火させる。これを 50 件毎にすると 30 日分の
  // backlog (10k+ episodes) では 8〜25 分 "0/N" のまま見え、ユーザーが
  // フリーズと誤認して reload → 部分作業の喪失ループに陥る。
  ctx.progress?.(totals.items_processed, totals.items_failed);

  if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
    checkpointProgress(ctx, state);
  }

  if (result.outcome === 'quarantine') {
    totals.items_failed += 1;
    return { quarantineCursor: result.quarantineCursor };
  }

  if (result.outcome === 'failed') {
    totals.items_failed += 1;
    state.consecutiveFailures += 1;
    return null;
  }

  // outcome === 'persisted'
  state.consecutiveFailures = 0;
  const s = result.stats;
  totals.entities_inserted += s.entities_inserted;
  totals.entities_updated += s.entities_updated;
  totals.entities_suppressed += s.entities_suppressed;
  totals.edges_inserted += s.edges_inserted;
  totals.edges_invalidated += s.edges_invalidated;
  totals.edges_suppressed += s.edges_suppressed;
  return null;
}

/** セッション 1 件（= 複数 episode）を順に処理する。 */
async function runIncrementalSession(
  episodes: ReturnType<typeof splitEpisodes>,
  ctx: IncrementalContext,
  state: IncrementalState,
): Promise<IncrementalSignal> {
  for (const episode of episodes) {
    // Ollama throttle が COOLING に入ったら以降の episode を処理せず中断する。
    // cursor は据え置き、永続化済み episode は次 run で existingIds が冪等に skip。
    if (ctx.shouldStop?.()) return { kind: 'stopped' };

    // Track latest timestamp seen — used ONLY for the completion-time
    // cursor advancement at end of run, not for mid-session bookkeeping.
    if (episode.valid_from > state.maxTimestamp) {
      state.maxTimestamp = episode.valid_from;
    }

    const quarantined = await runIncrementalEpisode(episode, ctx, state);
    if (quarantined) return { kind: 'quarantine', cursor: quarantined.quarantineCursor };
  }
  return { kind: 'continue' };
}

export async function runConversationIncremental(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  logger?: CaravanLogger;
  model?: string;
  /** 進捗チェックポイント時に呼ばれる save コールバック (sql.js memDb の disk 書き込み)。 */
  save?: () => void;
  /** 進捗チェックポイント時に呼ばれる progress callback (TreeView 表示用)。 */
  progress?: (processed: number, failed: number) => void;
  /**
   * episode ループ境界で確認する中断ゲート。true を返すと以降の episode を
   * 処理せず early return する (Ollama throttle COOLING 時の会話スキップ用)。
   * cursor は前進させないため、次 run で existingIds により冪等に再開する。
   */
  shouldStop?: () => boolean;
}): Promise<IncrementalResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const progress = opts.progress;
  const shouldStop = opts.shouldStop;

  const startedAt = new Date().toISOString();
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });

  // ── 1. Read pipeline state ───────────────────────────────────────────────
  const { last_processed_at } = readPipelineState(db);
  const sinceISO = last_processed_at || DEFAULT_SINCE;

  // ── 2. Insert pipeline_run + mark state as running ───────────────────────
  ledger.start(startedAt);
  upsertPipelineState(db, { status: 'running' });

  const existingIds = preloadExistingEpisodeIds(db, sinceISO);

  // Accumulators
  const totals: PersistStats & {
    items_processed: number;
    items_skipped: number;
    items_failed: number;
  } = {
    items_processed: 0,
    items_skipped: 0,
    entities_inserted: 0,
    entities_updated: 0,
    entities_suppressed: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    edges_suppressed: 0,
    items_failed: 0,
  };

  let finalStatus: 'success' | 'partial' | 'error' = 'success';
  let stoppedByThrottle = false;

  const ctx: IncrementalContext = { db, ollama, model, logger, ledger, save, progress, shouldStop, existingIds };
  const state: IncrementalState = { totals, maxTimestamp: sinceISO, consecutiveFailures: 0 };

  // ── 3. Iterate sessions ──────────────────────────────────────────────────
  try {
    for (const { messages } of readMessagesSince(db, sinceISO)) {
      const signal = await runIncrementalSession(splitEpisodes(messages), ctx, state);

      if (signal.kind === 'quarantine') {
        logger.error(
          `[anytime-memory] runConversationIncremental: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`
        );
        // 失敗 episode の valid_from + 1ms をカーソルに。これにより
        // 次回 run は失敗 episode を WHERE timestamp >= cursor で
        // 除外しつつ、後続セッションの未処理 episode は再走査される。
        // 失敗 episode 自体は caravan_failed_items に記録済みで
        // runConversationFailedItemsRetry が後で拾い直す。
        upsertPipelineState(db, {
          status: 'quarantine',
          last_processed_at: signal.cursor,
          error_detail: `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
        });
        ledger.finish(
          'partial',
          totals,
          `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
        );
        return { status: 'partial', ...totals };
      }
      if (signal.kind === 'stopped') {
        stoppedByThrottle = true;
        break;
      }

      // 意図的にここで last_processed_at を前進させない。
      // 旧実装は max(timestamp seen so far) でカーソルを毎セッション境界で
      // 前進させていたが、これは reload 時のデータスキップを引き起こした:
      // セッション iterate 順 (UUID / MIN(timestamp)) と各セッションの MAX
      // timestamp は無関係なので、ある 1 セッションが今日のメッセージを含む
      // だけで cursor が今日に飛び、未処理セッションが
      // WHERE timestamp >= cursor で永久に除外されていた。
      // 現設計: カーソル前進は「完了時 (loop 抜けた後) のみ」。途中で
      // reload されても次回 run が existingIds preload で永続化済み
      // エピソードを冪等にスキップする (権威ある skip 機構)。
    }
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationIncremental: fatal error during session iteration`,
      err
    );
    finalStatus = 'error';
    // エラー時もカーソルは触らない (上記と同じ理由)。
    upsertPipelineState(db, {
      status: 'error',
      error_detail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
    ledger.fail(err, totals);
    return { status: finalStatus, ...totals };
  }

  // ── 3.5 Throttle 中断 ─────────────────────────────────────────────────────
  // COOLING で中断した場合は cursor を前進させず partial で返す。last_processed_at
  // に '' を渡すと upsertPipelineState の CASE で既存 cursor が保持される。
  // 永続化済み episode は次 run の existingIds preload で冪等に skip される。
  if (stoppedByThrottle) {
    logger.info(
      `[anytime-memory] conversation incremental: throttle COOLING — stopping early ` +
        `(processed=${totals.items_processed}, failed=${totals.items_failed}), cursor unchanged`
    );
    upsertPipelineState(db, { status: 'idle', last_processed_at: '' });
    ledger.finish('partial', totals, 'throttle COOLING — stopped early, cursor unchanged');
    return { status: 'partial', ...totals };
  }

  // ── 4. Finalize ──────────────────────────────────────────────────────────
  // Advance maxTimestamp by 1 ms so that next run uses an exclusive lower bound
  // (the query uses >=, so incrementing prevents reprocessing the last episode).
  const nextSince =
    state.maxTimestamp === sinceISO
      ? sinceISO // no new messages were processed — keep the same cursor
      : new Date(new Date(state.maxTimestamp).getTime() + 1).toISOString();

  upsertPipelineState(db, {
    status: 'idle',
    last_processed_at: nextSince,
  });
  ledger.finish(finalStatus, totals);

  return { status: finalStatus, ...totals };
}
