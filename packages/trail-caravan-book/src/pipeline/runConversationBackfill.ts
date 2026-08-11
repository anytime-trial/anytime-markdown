import type { CaravanDbConnection } from '../db/connection/types';
import { PipelineRunLedger } from './PipelineRunLedger';
import { splitEpisodes } from '../canonical/splitEpisodes';
import { extractFactsFromEpisode } from '../ingest/conversation/extractFacts';
import { readMessagesSince } from '../ingest/conversation/readMessages';
import { episodeId, persistEpisodeFacts, type PersistStats } from '../ingest/conversation/persist';
import { noopLogger, type CaravanLogger } from '../logger';
import type { OllamaClient } from '@anytime-markdown/agent-core';

type PipelineStatus = 'success' | 'partial' | 'error';

const SCOPE = 'conversation_backfill';
const QUARANTINE_THRESHOLD = 3;
/**
 * 会話 backfill の既定期間 (日)。
 *
 * Single source of truth: trail-server/Config.ts と
 * trail-caravan-book/defaultCaravanBookPipelineRunner.ts はこの定数を import して
 * 使うこと。各所で別々に数値リテラルを書くと drift する (2026-05 に実際
 * 5 と 30 が混在した事故あり)。値を変えたいときはここだけ書き換える。
 */
export const DEFAULT_CONVERSATION_BACKFILL_DAYS = 30;
const PROGRESS_LOG_INTERVAL = 10;
const DEFAULT_EXTRACT_CONCURRENCY = 2;

function resolveExtractConcurrency(): number {
  const raw = process.env['MEMORY_CORE_EXTRACT_CONCURRENCY'];
  if (raw === undefined || raw === '') return DEFAULT_EXTRACT_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_EXTRACT_CONCURRENCY;
  return Math.floor(n);
}

export interface BackfillResult {
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

function computeSinceISO(db: CaravanDbConnection, sinceDays: number): string {
  const sinceFromDays = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const rows = db.exec(
    `SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?`,
    [SCOPE]
  );
  const lastProcessedAt = (rows[0]?.values?.[0]?.[0] as string | undefined) ?? '';
  // Resume from last_processed_at when it's set and newer than the sinceDays
  // window. This avoids re-scanning sessions whose episodes are already
  // persisted (existingIds still guards individual episodes, but skipping
  // sessions entirely saves splitEpisodes + DB scan cost).
  if (lastProcessedAt !== '' && lastProcessedAt > sinceFromDays) {
    return lastProcessedAt;
  }
  return sinceFromDays;
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

type BackfillEpisodeOutcome =
  | { outcome: 'failed' }
  | { outcome: 'quarantine'; quarantineCursor: string }
  | { outcome: 'persisted'; stats: PersistStats };

/**
 * Persists (or records a failure for) a single already-extracted backfill episode.
 * Returns typed outcome so the caller can update totals and quarantine without
 * duplicating branching logic.
 */
function persistBackfillEpisode(opts: {
  db: CaravanDbConnection;
  episode: ReturnType<typeof splitEpisodes>[number];
  ex: Awaited<ReturnType<typeof extractFactsFromEpisode>> | null;
  recordedAt: string;
  consecutiveFailures: number;
  logger: CaravanLogger;
}): BackfillEpisodeOutcome {
  const { db, episode, ex, recordedAt, consecutiveFailures, logger } = opts;

  if (ex === null) {
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
    const stats = persistEpisodeFacts({ db, episode, extracted: ex, recordedAt, logger });
    return { outcome: 'persisted', stats };
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationBackfill: persist failed for episode ${episode.message_uuid_start}`,
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
 * Backfill pipeline that re-reads messages from the last N days (default 7)
 * from the ATTACHed trail DB, splits them into episodes, runs LLM extraction,
 * and persists facts.
 *
 * Unlike the incremental pipeline, this always starts from `sinceDays` days ago
 * rather than reading from pipeline_state.last_processed_at.
 *
 * On success it also advances the incremental pipeline cursor so the incremental
 * run skips data that backfill already processed.
 *
 * The trail DB must already be ATTACHed as "trail" on `db` via
 * attachTrailDbFromHandle / attachTrailDbReadOnly before calling this function.
 */
type BackfillEpisode = ReturnType<typeof splitEpisodes>[number];
type ExtractedFacts = Awaited<ReturnType<typeof extractFactsFromEpisode>> | null;

/** セッション 1 件を処理した結果。呼び出し側のループ制御を戻り値へ写したもの。 */
type SessionSignal =
  | { kind: 'continue' }
  /** quarantine 到達。cursor を据えて partial で返す。 */
  | { kind: 'quarantine'; cursor: string }
  /** Ollama throttle COOLING による中断。cursor は据え置き。 */
  | { kind: 'stopped' };

interface BackfillContext {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  model: string | undefined;
  logger: CaravanLogger;
  ledger: PipelineRunLedger;
  save: (() => void) | undefined;
  progress: ((processed: number, failed: number) => void) | undefined;
  shouldStop: (() => boolean) | undefined;
  extractConcurrency: number;
  /** 進捗ログの分母（existingIds 控除後）。 */
  toProcess: number;
}

interface BackfillState {
  totals: PersistStats & { items_processed: number; items_skipped: number; items_failed: number };
  maxTimestamp: string;
  consecutiveFailures: number;
}

/**
 * 既に caravan_episodes にある episode id を先読みする。
 *
 * backfill が中断（VS Code reload・OS shutdown）されたとき persistEpisodeFacts は
 * 冪等だが extractFactsFromEpisode はそうではない。永続化済みの数千 episode へ
 * 再び LLM 抽出を走らせると 1 件 ~10 秒を無駄にするため、ここで skip して
 * 次回 backfill を実質 resume にする。
 */
function preloadExistingEpisodeIds(db: CaravanDbConnection, sinceISO: string): Set<string> {
  const existingIds = new Set<string>();
  const existsRows = db.exec(`SELECT id FROM caravan_episodes WHERE valid_from >= ?`, [sinceISO]);
  for (const row of existsRows[0]?.values ?? []) {
    existingIds.add(row[0] as string);
  }
  return existingIds;
}

/** 永続化済み（skip）と抽出対象に振り分ける。skip 分も maxTimestamp には反映する。 */
function partitionEpisodes(
  episodes: BackfillEpisode[],
  existingIds: ReadonlySet<string>,
  state: BackfillState,
): BackfillEpisode[] {
  const toExtract: BackfillEpisode[] = [];
  for (const episode of episodes) {
    const epId = episodeId(episode.session_id, episode.message_uuid_start);
    if (!existingIds.has(epId)) {
      toExtract.push(episode);
      continue;
    }
    state.totals.items_skipped += 1;
    if (episode.valid_from > state.maxTimestamp) {
      state.maxTimestamp = episode.valid_from;
    }
  }
  return toExtract;
}

/** LLM 抽出（I/O バウンドなのでバッチ内は並行）。1 件の失敗は null にして他を止めない。 */
async function extractBatchFacts(batch: BackfillEpisode[], ctx: BackfillContext): Promise<ExtractedFacts[]> {
  return Promise.all(
    batch.map(async (ep) => {
      try {
        return await extractFactsFromEpisode({
          ollama: ctx.ollama,
          episode: {
            raw_excerpt: ep.raw_excerpt,
            session_id: ep.session_id,
            message_uuid_start: ep.message_uuid_start,
            message_uuid_end: ep.message_uuid_end,
            valid_from: ep.valid_from,
          },
          model: ctx.model,
          logger: ctx.logger,
        });
      } catch (err) {
        ctx.logger.error(
          `[anytime-memory] runConversationBackfill: unexpected error in extractFacts for episode ${ep.message_uuid_start}`,
          err
        );
        return null;
      }
    })
  );
}

/**
 * episode 1 件を永続化し集計へ反映する。quarantine 到達時のみ cursor を返す
 * （ログ・pipeline_state 更新・ledger 確定は呼び出し側で 1 度だけ行う）。
 */
function persistBatchEpisode(
  args: { episode: BackfillEpisode; ex: ExtractedFacts; recordedAt: string },
  ctx: BackfillContext,
  state: BackfillState,
): { quarantineCursor: string } | null {
  const { totals } = state;
  totals.items_processed += 1;
  if (args.episode.valid_from > state.maxTimestamp) state.maxTimestamp = args.episode.valid_from;

  // UI 通知は毎エピソード発火 (incremental と同じ理由)。
  // 50 件 checkpoint 間で UI が 0/N のまま動かないように見える
  // 問題を避ける。DB checkpoint と保存は引き続き 10 件毎。
  ctx.progress?.(totals.items_processed, totals.items_failed);

  // Progress log every PROGRESS_LOG_INTERVAL episodes
  if (totals.items_processed % PROGRESS_LOG_INTERVAL === 0) {
    ctx.logger.info(`[anytime-memory] backfill progress: ${totals.items_processed}/${ctx.toProcess} episodes processed (${totals.items_skipped} skipped)`);
    ctx.ledger.heartbeat(totals);
    ctx.save?.();
  }

  const episodeResult = persistBackfillEpisode({
    db: ctx.db,
    episode: args.episode,
    ex: args.ex,
    recordedAt: args.recordedAt,
    consecutiveFailures: state.consecutiveFailures,
    logger: ctx.logger,
  });

  if (episodeResult.outcome === 'quarantine') {
    totals.items_failed += 1;
    return { quarantineCursor: episodeResult.quarantineCursor };
  }

  if (episodeResult.outcome === 'failed') {
    totals.items_failed += 1;
    state.consecutiveFailures += 1;
    return null;
  }

  // outcome === 'persisted'
  state.consecutiveFailures = 0;
  const s = episodeResult.stats;
  totals.entities_inserted += s.entities_inserted;
  totals.entities_updated += s.entities_updated;
  totals.entities_suppressed += s.entities_suppressed;
  totals.edges_inserted += s.edges_inserted;
  totals.edges_invalidated += s.edges_invalidated;
  totals.edges_suppressed += s.edges_suppressed;
  return null;
}

/**
 * セッション 1 件（= 複数 episode）を処理する。
 *
 * 抽出は LLM I/O バウンドのため並行、永続化は sql.js が単一スレッドの WASM で
 * スレッドセーフでないため直列。CONCURRENCY=1 なら従来の完全直列と等価。
 */
async function processBackfillSession(
  episodes: BackfillEpisode[],
  existingIds: ReadonlySet<string>,
  ctx: BackfillContext,
  state: BackfillState,
): Promise<SessionSignal> {
  const toExtract = partitionEpisodes(episodes, existingIds, state);

  for (let batchStart = 0; batchStart < toExtract.length; batchStart += ctx.extractConcurrency) {
    // Ollama throttle が COOLING に入ったら次バッチを処理せず中断する。
    // cursor は据え置き、永続化済み episode は次 run で existingIds が冪等に skip。
    if (ctx.shouldStop?.()) return { kind: 'stopped' };

    const batch = toExtract.slice(batchStart, batchStart + ctx.extractConcurrency);
    const recordedAt = new Date().toISOString();
    const extracted = await extractBatchFacts(batch, ctx);

    // consecutiveFailures はバッチ内でも 1 件ずつ進み、旧直列実装と同じ数え方になる。
    for (let j = 0; j < batch.length; j++) {
      const quarantined = persistBatchEpisode(
        { episode: batch[j], ex: extracted[j], recordedAt },
        ctx,
        state,
      );
      if (quarantined) return { kind: 'quarantine', cursor: quarantined.quarantineCursor };
    }
  }
  return { kind: 'continue' };
}

export async function runConversationBackfill(opts: {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  sinceDays?: number;
  logger?: CaravanLogger;
  model?: string;
  /**
   * Persist the in-memory sql.js DB to the underlying file. Called at backfill
   * start, each session start, and every progress-log interval so a VS Code
   * reload mid-backfill loses at most PROGRESS_LOG_INTERVAL episodes of work.
   */
  save?: () => void;
  /**
   * 進捗通知 callback。UI (PipelineStatusWriter) へリアルタイム反映する。
   * 毎エピソード発火 (incremental と同じ。50 件毎の checkpoint で UI が
   * 凍って見える問題を避ける)。
   */
  progress?: (processed: number, failed: number) => void;
  /**
   * 「実際に処理すべきエピソード数」を 1 度だけ通知する callback。
   * existingIds 控除後の数字なので、UI 分母として正確。事前カウント直後に
   * 1 回呼ばれる。runEmbeddingBackfill と同じパターン。
   */
  onTotal?: (total: number) => void;
  /**
   * バッチ境界で確認する中断ゲート。true を返すと以降のバッチを処理せず
   * early return する (Ollama throttle COOLING 時の会話スキップ用)。cursor は
   * 前進させないため、次 run で existingIds により冪等に再開する。
   */
  shouldStop?: () => boolean;
}): Promise<BackfillResult> {
  const { db, ollama, model } = opts;
  const logger = opts.logger ?? noopLogger;
  const save = opts.save;
  const progress = opts.progress;
  const onTotal = opts.onTotal;
  const shouldStop = opts.shouldStop;
  const sinceDays = opts.sinceDays ?? DEFAULT_CONVERSATION_BACKFILL_DAYS;
  const extractConcurrency = resolveExtractConcurrency();

  const startedAt = new Date().toISOString();
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });

  // ── 1. Compute sinceISO: max(sinceDays前, last_processed_at) ─────────────
  // Resume from last_processed_at when it's set, so re-runs after VS Code
  // reload don't re-scan sessions whose episodes are already in caravan_episodes.
  const sinceISO = computeSinceISO(db, sinceDays);

  // ── 2. Insert pipeline_run + mark state as running ───────────────────────
  ledger.start(startedAt);
  upsertPipelineState(db, { status: 'running' });

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

  // ── 3. Iterate sessions ──────────────────────────────────────────────────
  // Pre-count sessions for progress display
  const sessionList = [...readMessagesSince(db, sinceISO)];
  const totalSessions = sessionList.length;
  const totalEpisodes = sessionList.reduce(
    (sum, { messages }) => sum + splitEpisodes(messages).length, 0
  );

  const existingIds = preloadExistingEpisodeIds(db, sinceISO);
  const toProcess = totalEpisodes - existingIds.size;
  logger.info(
    `[anytime-memory] backfill: ${totalSessions} sessions, ${totalEpisodes} episodes ` +
    `(${existingIds.size} already persisted, ${toProcess} to process, since ${sinceDays}d ago)`
  );
  // UI に「正確な分母」を通知 (existingIds 控除後)。orchestrator 側の
  // convTotalEstimate は user メッセージ全件カウントで膨張するため、UI 表示は
  // この値で上書きする想定。
  onTotal?.(toProcess);
  ledger.heartbeat(totals);
  save?.();

  const ctx: BackfillContext = {
    db, ollama, model, logger, ledger, save, progress, shouldStop, extractConcurrency, toProcess,
  };
  const state: BackfillState = { totals, maxTimestamp: sinceISO, consecutiveFailures: 0 };

  let sessionIdx = 0;
  try {
    for (const { session_id, messages } of sessionList) {
      sessionIdx += 1;
      const episodes = splitEpisodes(messages);
      logger.info(
        `[anytime-memory] backfill: session ${sessionIdx}/${totalSessions} — ${session_id.slice(0, 12)} (${episodes.length} episodes)`
      );
      ledger.heartbeat(totals);
      save?.();

      const signal = await processBackfillSession(episodes, existingIds, ctx, state);

      if (signal.kind === 'quarantine') {
        logger.error(`[anytime-memory] runConversationBackfill: ${QUARANTINE_THRESHOLD} consecutive failures — entering quarantine`);
        // 失敗 episode + 1ms をカーソルに。後続セッションは再走査可能。
        upsertPipelineState(db, {
          status: 'quarantine',
          last_processed_at: signal.cursor,
          error_detail: `${QUARANTINE_THRESHOLD} consecutive extraction failures`,
        });
        ledger.finish('partial', totals, `${QUARANTINE_THRESHOLD} consecutive extraction failures`);
        return { status: 'partial', ...totals };
      }
      if (signal.kind === 'stopped') {
        stoppedByThrottle = true;
        break;
      }

      // 意図的にここで last_processed_at を前進させない。
      // 旧実装は max(timestamp seen) をセッション境界毎にカーソル化していたが、
      // セッション iterate 順 (MIN(timestamp)) と各セッションの MAX timestamp は
      // 別軸なので、長期セッション 1 つで cursor が一気に飛び、未処理の後続
      // セッションが WHERE timestamp >= cursor で永久に除外されていた。
      // 現設計: カーソル前進は「完了時 + quarantine 時のみ」。途中中断は
      // existingIds preload で冪等に skip するので作業は失われない。
    }
  } catch (err) {
    logger.error(
      `[anytime-memory] runConversationBackfill: fatal error during session iteration`,
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
  // COOLING で中断した場合は backfill / incremental どちらの cursor も前進させず
  // partial で返す。last_processed_at に '' を渡すと既存 cursor が保持される。
  // 永続化済み episode は次 run の existingIds preload で冪等に skip される。
  if (stoppedByThrottle) {
    logger.info(
      `[anytime-memory] backfill: throttle COOLING — stopping early ` +
        `(processed=${totals.items_processed}, failed=${totals.items_failed}), cursor unchanged`
    );
    upsertPipelineState(db, { status: 'idle', last_processed_at: '' });
    ledger.finish('partial', totals, 'throttle COOLING — stopped early, cursor unchanged');
    return { status: 'partial', ...totals };
  }

  // ── 4. Finalize ──────────────────────────────────────────────────────────
  const nextSince =
    state.maxTimestamp === sinceISO
      ? sinceISO
      : new Date(new Date(state.maxTimestamp).getTime() + 1).toISOString();

  // Update backfill pipeline state
  upsertPipelineState(db, {
    status: 'idle',
    last_processed_at: nextSince,
  });

  // Also advance incremental cursor so it skips backfilled data
  db.run(
    `INSERT INTO caravan_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES ('conversation_incremental', 'idle', ?, '')
     ON CONFLICT(scope) DO UPDATE SET
       last_processed_at = CASE
         WHEN last_processed_at < excluded.last_processed_at THEN excluded.last_processed_at
         ELSE last_processed_at
       END`,
    [nextSince]
  );

  ledger.finish(finalStatus, totals);

  return { status: finalStatus, ...totals };
}
