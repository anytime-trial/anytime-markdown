import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MemoryDbConnection } from '../db/connection/types';
import { PipelineRunLedger } from './PipelineRunLedger';
import { parseReviewDoc } from '../ingest/review/parseReviewDoc';
import { entityId } from '../canonical/entityId';
import { parseReviewSessions } from '../ingest/review/parseReviewSession';
import { refineCategories } from '../ingest/review/extractFindings';
import {
  upsertReviewDoc,
  upsertReviewSession,
  reconcileExistingReviewRow,
  needsReviewRowReconcile,
} from '../ingest/review/persist';
import { resolveReviewTargets } from '../ingest/review/resolveReviewTargets';
import { linkAddresses } from '../ingest/review/linkAddresses';
import { linkPrecedesBugs } from '../ingest/review/linkPrecedesBugs';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import { noopLogger, type MemoryLogger } from '../logger';

type PipelineStatus = 'success' | 'partial' | 'error';

const SCOPE_DOC = 'review_incremental';
const SCOPE_SESSION = 'review_session_incremental';
const DEFAULT_REVIEW_DIR = '/Shared/anytime-markdown-docs/review';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const PROGRESS_LOG_INTERVAL = 50;

export interface ReviewIncrementalResult {
  status: PipelineStatus;
  items_processed: number;
  reviews_inserted: number;
  findings_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

// ── Private helpers (same pattern as runBugHistoryIncremental.ts) ─────────────

function readPipelineState(db: MemoryDbConnection, scope: string): string {
  const stmt = db.prepare(`SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?`);
  try {
    const row = stmt.get(scope);
    if (row) return (row['last_processed_at'] as string) || DEFAULT_SINCE;
    return DEFAULT_SINCE;
  } finally {
    stmt.free?.();
  }
}

function upsertPipelineState(
  db: MemoryDbConnection,
  scope: string,
  opts: { status: string; last_processed_at?: string; error_detail?: string },
): void {
  db.run(
    `INSERT INTO caravan_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail = excluded.error_detail`,
    [scope, opts.status, opts.last_processed_at ?? '', opts.error_detail ?? ''],
  );
}

function recordFailedItem(
  db: MemoryDbConnection,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string,
): void {
  db.run(
    `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [scope, itemKey, new Date().toISOString(), reason, detail],
  );
}

type RouteADocResult =
  | { outcome: 'skipped' }
  | { outcome: 'failed'; detail: string }
  | { outcome: 'processed'; is_new: boolean; findings_inserted: number; edges_inserted: number };

/**
 * Processes a single Route A review doc file.
 * Reads file, checks source_hash, parses, refines categories, upserts.
 */
async function processRouteADoc(opts: {
  db: MemoryDbConnection;
  filePath: string;
  relPath: string;
  reviewDir: string;
  recordedAt: string;
  force: boolean;
  ollama: OllamaClient;
  model: string;
  /** 取込を実行しているワークスペースの repo_name。自分が書いた行にだけ設定する。 */
  workspace: string;
  logger: MemoryLogger;
}): Promise<RouteADocResult> {
  const { db, filePath, relPath, recordedAt, force, ollama, model, logger } = opts;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const sha1 = createHash('sha1').update(content).digest('hex').slice(0, 16);

    const existingRows = db.exec(
      `SELECT source_hash, body_excerpt, workspace FROM caravan_reviews
        WHERE source_kind='review_doc' AND source_ref=?`,
      [relPath],
    );
    const existingRow = existingRows[0]?.values?.[0];
    const existingHash = existingRow?.[0] == null ? null : String(existingRow[0]);
    // body_excerpt / summary / workspace は後から足した列で、内容が変わっていない
    // 既存行は空のまま残っている。ハッシュ一致の skip はこの補完より手前にあるため、
    // ここで塞がないと下流（upsertReviewDoc・:176 の workspace UPDATE）へ到達しない。
    const needsReconcile =
      existingRow !== undefined &&
      needsReviewRowReconcile(String(existingRow[1] ?? ''), String(existingRow[2] ?? ''));

    if (!force && existingHash !== null && existingHash === sha1) {
      if (needsReconcile) {
        // LLM を使う refineCategories は通さない。埋めるのは後から足した列だけで、
        // 指摘は既存行のものをそのまま使う。
        const parsed = parseReviewDoc({ rel_path: relPath, content });
        if (parsed !== null) {
          reconcileExistingReviewRow(db, entityId('Review', relPath), {
            summary: parsed.frontmatter.excerpt ?? '',
            bodyExcerpt: parsed.bodyExcerpt,
            workspace: opts.workspace,
          });
          logger.info(`[anytime-memory] runReviewIncremental: reconciled existing row file=${relPath}`);
        }
      }
      logger.info(`[anytime-memory] runReviewIncremental: skip unchanged file=${relPath}`);
      return { outcome: 'skipped' };
    }

    if (force && existingHash !== null) {
      db.run(
        `DELETE FROM caravan_review_findings WHERE review_id IN (
           SELECT id FROM caravan_reviews WHERE source_kind='review_doc' AND source_ref=?
         )`,
        [relPath],
      );
      db.run(
        `UPDATE caravan_reviews SET source_hash='' WHERE source_kind='review_doc' AND source_ref=?`,
        [relPath],
      );
      logger.info(`[anytime-memory] runReviewIncremental: force re-parse, cleared findings file=${relPath}`);
    }

    const doc = parseReviewDoc({ rel_path: relPath, content });
    if (doc === null) {
      logger.info(`[anytime-memory] runReviewIncremental: not a review doc, skip=${relPath}`);
      return { outcome: 'skipped' };
    }

    const refined = await refineCategories({
      findings: doc.findings,
      ollama,
      model,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    doc.findings.splice(0, doc.findings.length, ...refined.findings);

    const result = upsertReviewDoc(db, doc, relPath, sha1, recordedAt, logger);
    // 取込側のワークスペースが自明なのは「いま自分が書いた行」だけ。
    // 未解決行を一括で埋めると他ワークスペース由来の行まで刻印してしまう。
    db.run(
      `UPDATE caravan_reviews SET workspace = ?
        WHERE source_kind = 'review_doc' AND source_ref = ? AND workspace = ''`,
      [opts.workspace, relPath],
    );
    return {
      outcome: 'processed',
      is_new: result.is_new,
      findings_inserted: result.findings_inserted,
      edges_inserted: result.edges_inserted,
    };
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.error(`[anytime-memory] runReviewIncremental: failed to process file=${filePath}`, err);
    return { outcome: 'failed', detail };
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runReviewIncremental(input: {
  db: MemoryDbConnection;
  repoName: string;
  reviewDir?: string;
  ollama: OllamaClient;
  model?: string;
  logger?: MemoryLogger;
  /**
   * true の場合、Route A の source_hash skip を bypass し全 review .md を再パースする。
   * 既存 finding は review_id ごとに DELETE してから再投入する。
   * env `MEMORY_CORE_REVIEW_FORCE=1` でも true 扱い。
   * Route B (session) も last_processed_at を無視して期間全体を再走査する。
   */
  force?: boolean;
}): Promise<ReviewIncrementalResult> {
  const { db, repoName, ollama } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? 'qwen2.5:7b';
  const reviewDir =
    input.reviewDir ?? process.env['MEMORY_CORE_REVIEW_DIR'] ?? DEFAULT_REVIEW_DIR;
  const force = input.force === true || process.env['MEMORY_CORE_REVIEW_FORCE'] === '1';
  if (force) {
    logger.info('[anytime-memory] runReviewIncremental: force re-ingest enabled (skip source_hash, reset session state)');
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const ledger = new PipelineRunLedger({ db, scope: SCOPE_DOC, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);
  upsertPipelineState(db, SCOPE_DOC, { status: 'running' });

  const totals = {
    items_processed: 0,
    entities_inserted: 0,
    edges_inserted: 0,
  };
  let reviewsInserted = 0;
  let findingsInserted = 0;
  let itemsFailed = 0;
  const recordedAt = new Date().toISOString();

  // ── Route A: doc files ────────────────────────────────────────────────────

  if (fs.existsSync(reviewDir)) {
    let mdFiles: string[];
    try {
      mdFiles = fs
        .readdirSync(reviewDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(reviewDir, f));
    } catch (err) {
      logger.error(`[anytime-memory] runReviewIncremental: failed to list reviewDir=${reviewDir}`, err);
      mdFiles = [];
    }

    logger.info(`[anytime-memory] review incremental (Route A): ${mdFiles.length} review docs to process`);
    let routeAProcessed = 0;
    for (const filePath of mdFiles) {
      const relPath = path.relative(path.dirname(reviewDir), filePath);
      totals.items_processed += 1;
      routeAProcessed += 1;
      if (routeAProcessed % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(`[anytime-memory] review incremental Route A progress: ${routeAProcessed}/${mdFiles.length}`);
      }

      const docResult = await processRouteADoc({
        db, filePath, relPath, reviewDir, recordedAt, force, ollama, model,
        workspace: repoName, logger,
      });

      if (docResult.outcome === 'skipped') {
        continue;
      }
      if (docResult.outcome === 'failed') {
        recordFailedItem(db, SCOPE_DOC, relPath, 'parse_error', docResult.detail);
        itemsFailed += 1;
        continue;
      }
      // outcome === 'processed'
      if (docResult.is_new) {
        reviewsInserted += 1;
        totals.entities_inserted += 1;
      }
      findingsInserted += docResult.findings_inserted;
      totals.edges_inserted += docResult.edges_inserted;
    }
  } else {
    logger.info(
      `[anytime-memory] runReviewIncremental: reviewDir does not exist, skipping Route A (dir=${reviewDir})`,
    );
  }

  // ── Route B: sessions ─────────────────────────────────────────────────────

  try {
    // force 時: last_processed_at をリセットして全期間再走査、既存 session findings を削除
    const lastProcessedAt = force
      ? '1970-01-01T00:00:00.000Z'
      : readPipelineState(db, SCOPE_SESSION);
    if (force) {
      db.run(
        `DELETE FROM caravan_review_findings WHERE review_id IN (
           SELECT id FROM caravan_reviews WHERE source_kind='session'
         )`,
      );
      logger.info('[anytime-memory] runReviewIncremental: force re-parse, cleared all session findings');
    }

    const sessions = parseReviewSessions({
      db,
      sinceISO: lastProcessedAt,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });

    let maxReviewedAt = lastProcessedAt;

    logger.info(`[anytime-memory] review incremental (Route B): ${sessions.length} sessions to process`);
    let routeBProcessed = 0;
    for (const session of sessions) {
      totals.items_processed += 1;
      routeBProcessed += 1;
      if (routeBProcessed % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `[anytime-memory] review incremental Route B progress: ${routeBProcessed}/${sessions.length}`
        );
      }
      try {
        const refined = await refineCategories({
          findings: session.findings,
          ollama,
          model,
          logger: {
            warn: (msg: string) => logger.info(msg),
          },
        });
        session.findings.splice(0, session.findings.length, ...refined.findings);

        const result = upsertReviewSession(db, session, recordedAt, logger);
        if (result.is_new) {
          reviewsInserted += 1;
          totals.entities_inserted += 1;
        }
        findingsInserted += result.findings_inserted;
        totals.edges_inserted += result.edges_inserted;

        if (session.reviewed_at > maxReviewedAt) {
          maxReviewedAt = session.reviewed_at;
        }
      } catch (err) {
        const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
        logger.error(
          `[anytime-memory] runReviewIncremental: failed to process session=${session.session_id}`,
          err,
        );
        recordFailedItem(
          db,
          SCOPE_SESSION,
          `${session.session_id}#${session.message_uuid_start}`,
          'session_error',
          detail,
        );
        itemsFailed += 1;
      }
    }

    if (sessions.length > 0) {
      upsertPipelineState(db, SCOPE_SESSION, {
        last_processed_at: maxReviewedAt,
        status: 'idle',
      });
    }
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: Route B failed`, err);
    itemsFailed += 1;
  }

  // ── Post-processing: resolveReviewTargets → linkAddresses + linkPrecedesBugs ──
  //
  // 対象パスの正規化とリポジトリ解決は linkAddresses より **前** に置く。
  // linkAddresses は target_repo を照合キーに使うため、解決前に走らせると
  // 今回取り込んだ指摘が 1 サイクル遅れてしかリンクされない。

  try {
    const resolveResult = resolveReviewTargets({
      db,
      logger: {
        warn: (msg: string) => logger.info(msg),
        error: (msg: string, err?: unknown) => logger.error(msg, err),
        info: (msg: string) => logger.info(msg),
      },
    });
    logger.info(
      `[anytime-memory] runReviewIncremental: resolveReviewTargets ` +
        `workspaces=${resolveResult.workspacesFilled} targets=${resolveResult.targetsResolved} ` +
        `normalized=${resolveResult.pathsNormalized} rejected=${resolveResult.pathsRejected}`,
    );
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: resolveReviewTargets failed`, err);
  }

  try {
    const linkResult = linkAddresses({
      db,
      windowDays: 30,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });
    totals.edges_inserted += linkResult.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: linkAddresses failed`, err);
  }

  try {
    const precedesResult = linkPrecedesBugs({
      db,
      windowDays: 60,
      logger: {
        warn: (msg: string) => logger.info(msg),
      },
    });
    totals.edges_inserted += precedesResult.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: linkPrecedesBugs failed`, err);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  const partialOrSuccess: 'partial' | 'success' = itemsFailed > 0 ? 'partial' : 'success';
  const finalStatus: 'success' | 'partial' | 'error' =
    itemsFailed > 0 && totals.items_processed === itemsFailed ? 'error' : partialOrSuccess;

  upsertPipelineState(db, SCOPE_DOC, { status: 'idle' });
  ledger.finish(
    finalStatus,
    totals,
    itemsFailed > 0 ? `${itemsFailed} item(s) failed to ingest` : '',
  );

  const durationMs = Date.now() - startMs;

  logger.info(
    `[anytime-memory] runReviewIncremental: done status=${finalStatus}, items_processed=${totals.items_processed}, ` +
      `reviews_inserted=${reviewsInserted}, findings_inserted=${findingsInserted}, ` +
      `edges_inserted=${totals.edges_inserted}, duration_ms=${durationMs}`,
  );

  return {
    status: finalStatus,
    items_processed: totals.items_processed,
    reviews_inserted: reviewsInserted,
    findings_inserted: findingsInserted,
    edges_inserted: totals.edges_inserted,
    duration_ms: durationMs,
  };
}
