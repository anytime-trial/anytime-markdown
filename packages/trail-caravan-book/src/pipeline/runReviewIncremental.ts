import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CaravanDbConnection } from '../db/connection/types';
import { PipelineRunLedger } from './PipelineRunLedger';
import { parseReviewDoc } from '../ingest/review/parseReviewDoc';
import { entityId } from '../canonical/entityId';
import { parseReviewSessions } from '../ingest/review/parseReviewSession';
import type { MemoryWorkspaceScope } from '../ingest/workspaceScope';
import { refineCategories } from '../ingest/review/extractFindings';
import type { ParsedFinding } from '../ingest/review/findingHelpers';
import { CATEGORIES } from '../ollama/prompts/reviewFindingCategory';
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
import { noopLogger, type CaravanLogger } from '../logger';

type PipelineStatus = 'success' | 'partial' | 'error';

const SCOPE_DOC = 'review_incremental';
const SCOPE_SESSION = 'review_session_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const PROGRESS_LOG_INTERVAL = 50;
/**
 * 1 回の run で埋め直す `pending_llm` の上限。LLM 呼び出しは 1 件 1 リクエストなので、
 * 溜まった分を一度に流すと 1 run が何時間も走る。残りは次の run が拾う（cursor は
 * 使わず、埋まった行が母集合から抜けることで前進する）。
 */
const PENDING_CATEGORY_BATCH = 100;
/**
 * 1 指摘あたりの埋め直し試行上限。これを超えた指摘は母集合から外し、件数をログへ出す。
 * 上限を置かないと、恒常的に不正な応答を返す入力が母集合の先頭を占め続け、その背後の
 * 指摘へ永久に到達しない（Claude / Codex がマージ前レビューで独立に指摘）。
 */
const PENDING_CATEGORY_MAX_ATTEMPTS = 3;

/** DB の生値を category の union へ絞り込む。想定外の値は 'other' へ落とす（型アサーションを使わない）。 */
function toFindingCategory(raw: unknown): ParsedFinding['category'] {
  const value = String(raw);
  return (CATEGORIES as readonly string[]).includes(value)
    ? (value as ParsedFinding['category'])
    : 'other';
}

export interface ReviewIncrementalResult {
  status: PipelineStatus;
  items_processed: number;
  reviews_inserted: number;
  findings_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

// ── Private helpers (same pattern as runBugHistoryIncremental.ts) ─────────────

function readPipelineState(db: CaravanDbConnection, scope: string): string {
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
  db: CaravanDbConnection,
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
  db: CaravanDbConnection,
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
  db: CaravanDbConnection;
  filePath: string;
  relPath: string;
  reviewDir: string;
  recordedAt: string;
  force: boolean;
  ollama: OllamaClient;
  model: string;
  chatAvailable: boolean;
  /** 取込を実行しているワークスペースの repo_name。自分が書いた行にだけ設定する。 */
  workspace: string;
  logger: CaravanLogger;
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
      chatAvailable: opts.chatAvailable,
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

/** Route A / Route B / 後処理が共通で積み上げる集計。 */
interface ReviewTotals {
  totals: { items_processed: number; entities_inserted: number; edges_inserted: number };
  reviewsInserted: number;
  findingsInserted: number;
  itemsFailed: number;
  /**
   * Route A の取込元ディレクトリが実在しなかったときの実パス。
   *
   * 「取込元が無い」を success で通さないために持つ。この状態は設定漏れで最も起きやすい
   * 失敗であり、しかも 0 件成功と見分けが付かない形で現れる（本 pipeline が塞ぎに来た
   * 事故そのもの）。null = ディレクトリは実在した。
   */
  reviewDirMissing: string | null;
}

interface RouteContext {
  db: CaravanDbConnection;
  repoName: string;
  workspaceScope: MemoryWorkspaceScope;
  ollama: OllamaClient;
  model: string;
  chatAvailable: boolean;
  logger: CaravanLogger;
  recordedAt: string;
  force: boolean;
}

function listReviewDocs(reviewDir: string, logger: CaravanLogger): string[] {
  try {
    return fs
      .readdirSync(reviewDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(reviewDir, f));
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: failed to list reviewDir=${reviewDir}`, err);
    return [];
  }
}

/** Route A: `<reviewDir>/*.md` を 1 件ずつ取り込む。 */
async function runRouteADocs(acc: ReviewTotals, reviewDir: string, ctx: RouteContext): Promise<void> {
  const { db, logger } = ctx;
  if (!fs.existsSync(reviewDir)) {
    // info に留めない。設定漏れで最も起きやすい失敗が、ログ 1 行だけ残して
    // 台帳には success として積まれるのを避ける。
    logger.error(
      `[anytime-memory] runReviewIncremental: reviewDir does not exist, skipping Route A (dir=${reviewDir})`,
    );
    acc.reviewDirMissing = reviewDir;
    return;
  }

  const mdFiles = listReviewDocs(reviewDir, logger);
  logger.info(`[anytime-memory] review incremental (Route A): ${mdFiles.length} review docs to process`);
  let routeAProcessed = 0;
  for (const filePath of mdFiles) {
    const relPath = path.relative(path.dirname(reviewDir), filePath);
    acc.totals.items_processed += 1;
    routeAProcessed += 1;
    if (routeAProcessed % PROGRESS_LOG_INTERVAL === 0) {
      logger.info(`[anytime-memory] review incremental Route A progress: ${routeAProcessed}/${mdFiles.length}`);
    }

    const docResult = await processRouteADoc({
      db, filePath, relPath, reviewDir, recordedAt: ctx.recordedAt, force: ctx.force,
      ollama: ctx.ollama, model: ctx.model, chatAvailable: ctx.chatAvailable,
      workspace: ctx.repoName, logger,
    });

    if (docResult.outcome === 'skipped') continue;
    if (docResult.outcome === 'failed') {
      recordFailedItem(db, SCOPE_DOC, relPath, 'parse_error', docResult.detail);
      acc.itemsFailed += 1;
      continue;
    }
    // outcome === 'processed'
    if (docResult.is_new) {
      acc.reviewsInserted += 1;
      acc.totals.entities_inserted += 1;
    }
    acc.findingsInserted += docResult.findings_inserted;
    acc.totals.edges_inserted += docResult.edges_inserted;
  }
}

/** Route B のセッション 1 件。失敗しても他セッションを止めない。 */
async function ingestReviewSession(
  acc: ReviewTotals,
  session: ReturnType<typeof parseReviewSessions>[number],
  ctx: RouteContext,
): Promise<string | null> {
  const { db, logger } = ctx;
  try {
    const refined = await refineCategories({
      findings: session.findings,
      ollama: ctx.ollama,
      model: ctx.model,
      chatAvailable: ctx.chatAvailable,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    session.findings.splice(0, session.findings.length, ...refined.findings);

    const result = upsertReviewSession(db, session, ctx.recordedAt, logger);
    if (result.is_new) {
      acc.reviewsInserted += 1;
      acc.totals.entities_inserted += 1;
    }
    acc.findingsInserted += result.findings_inserted;
    acc.totals.edges_inserted += result.edges_inserted;
    return session.reviewed_at;
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
    acc.itemsFailed += 1;
    return null;
  }
}

/** Route B: レビュー会話セッションを取り込む。 */
async function runRouteBSessions(acc: ReviewTotals, ctx: RouteContext): Promise<void> {
  const { db, logger, force } = ctx;
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
      workspaceScope: ctx.workspaceScope,
      logger: { warn: (msg: string) => logger.info(msg) },
    });

    let maxReviewedAt = lastProcessedAt;
    logger.info(`[anytime-memory] review incremental (Route B): ${sessions.length} sessions to process`);
    let routeBProcessed = 0;
    for (const session of sessions) {
      acc.totals.items_processed += 1;
      routeBProcessed += 1;
      if (routeBProcessed % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `[anytime-memory] review incremental Route B progress: ${routeBProcessed}/${sessions.length}`
        );
      }
      const reviewedAt = await ingestReviewSession(acc, session, ctx);
      if (reviewedAt !== null && reviewedAt > maxReviewedAt) {
        maxReviewedAt = reviewedAt;
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
    acc.itemsFailed += 1;
  }
}

/**
 * chat model 不在の回で `pending_llm` として取り込んだ指摘の category を埋め直す。
 *
 * source_hash の一致で md 自体は再処理されないため、この経路が無いと chat が居なかった
 * 期間の指摘は永久に未確定のまま残る。逆に言えば、取込と精緻化を分離できたのは
 * この後追い経路があるからで、片方だけを入れない。
 */
async function refinePendingCategoriesStep(acc: ReviewTotals, ctx: RouteContext): Promise<void> {
  const { db, chatAvailable, logger } = ctx;
  if (!chatAvailable) return;
  try {
    // 母集合は「自ワークスペースの review に属し、まだ試行上限に達していない指摘」。
    // workspace で絞るのは、caravan-book.db が複数ワークスペースの review 行を持ちうる器で、
    // 自分の chat model で他ワークスペースの指摘を書き換えないため（Route A / Route B と同じ境界）。
    // 試行回数で絞らないと、恒久的に推論が失敗する行が上限件数ぶん溜まった時点で
    // 毎回同じ先頭集合を引き直し、その背後の行へ永久に到達しない。
    const rows = db.exec(
      `SELECT f.id, f.finding_text, f.category
         FROM caravan_review_findings f
         JOIN caravan_reviews r ON r.id = f.review_id
        WHERE f.category_inferred_by = 'pending_llm'
          AND f.category_refine_attempts < ?
          AND r.workspace = ?
        ORDER BY f.category_refine_attempts ASC, f.recorded_at ASC
        LIMIT ?`,
      [PENDING_CATEGORY_MAX_ATTEMPTS, ctx.repoName, PENDING_CATEGORY_BATCH],
    );
    const pending = rows[0]?.values ?? [];
    if (pending.length === 0) return;

    // 選んだ行は結果に関わらず試行済みとして数える。成功した行はこの直後に
    // category_inferred_by='llm' へ抜けるので、残るのは失敗した行だけになる。
    const ids = pending.map((r) => String(r[0]));
    for (const id of ids) {
      db.run(
        `UPDATE caravan_review_findings
            SET category_refine_attempts = category_refine_attempts + 1
          WHERE id = ?`,
        [id],
      );
    }

    // finding_index は refineCategories が並び順を復元する相関キー（kept / needsLLM に
    // 分割してから finding_index で sort し直す実装）。ここでは ids の添字として使う。
    // chapter_path を空で渡すのは、章見出しが caravan_review_findings に永続化されて
    // いないため。取込時推論より文脈が少なく、精度は構造的に劣る（許容する縮退）。
    const refined = await refineCategories({
      findings: pending.map((r, i) => ({
        finding_index: i,
        target_file_path: null,
        target_symbol: null,
        target_line_start: null,
        target_line_end: null,
        category: toFindingCategory(r[2]),
        severity: 'info',
        finding_text: String(r[1]),
        suggestion_text: '',
        chapter_path: '',
        is_category_inferred: true,
        checklist_ref: null,
      })),
      ollama: ctx.ollama,
      model: ctx.model,
      chatAvailable: true,
      logger: { warn: (msg: string) => logger.info(msg) },
    });

    let updated = 0;
    for (const finding of refined.findings) {
      if (finding.category_inferred_by !== 'llm') continue;
      const id = ids[finding.finding_index];
      if (id === undefined) continue;
      db.run(
        `UPDATE caravan_review_findings SET category = ?, category_inferred_by = 'llm' WHERE id = ?`,
        [finding.category, id],
      );
      // 期待値ではなく実際の更新件数を数える。乖離したときにログが嘘をつかないようにする。
      updated += db.getRowsModified();
    }

    // 上限に達して母集合から外れた行を毎回数える。これを出さないと「埋まらない指摘」が
    // 静かに滞留し、本 pipeline が塞ぎに来たのと同じ無言の欠落になる。
    const exhausted = Number(
      db.exec(
        `SELECT COUNT(*) FROM caravan_review_findings f
           JOIN caravan_reviews r ON r.id = f.review_id
          WHERE f.category_inferred_by = 'pending_llm'
            AND f.category_refine_attempts >= ?
            AND r.workspace = ?`,
        [PENDING_CATEGORY_MAX_ATTEMPTS, ctx.repoName],
      )[0]?.values?.[0]?.[0] ?? 0,
    );
    logger.info(
      `[anytime-memory] runReviewIncremental: refinePendingCategories ` +
        `pending=${pending.length} updated=${updated} exhausted=${exhausted}`,
    );
    if (exhausted > 0) {
      logger.error(
        `[anytime-memory] runReviewIncremental: refinePendingCategories ` +
          `試行上限 ${PENDING_CATEGORY_MAX_ATTEMPTS} 回に達した指摘が ${exhausted} 件あります` +
          `（category が確定しないまま残ります）`,
      );
    }
  } catch (err) {
    logger.error(
      `[anytime-memory] runReviewIncremental: refinePendingCategories failed`,
      err,
    );
    // ログだけに留めない。恒久的に失敗する環境で run が success を積み続けると、
    // 「動いているのに埋まらない」状態が台帳から読めなくなる。
    acc.itemsFailed += 1;
  }
}

/**
 * 対象パスの正規化とリポジトリ解決。linkAddresses より **前** に置く。
 * linkAddresses は target_repo を照合キーに使うため、解決前に走らせると
 * 今回取り込んだ指摘が 1 サイクル遅れてしかリンクされない。
 */
function resolveTargetsStep(db: CaravanDbConnection, logger: CaravanLogger): void {
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
        `normalized=${resolveResult.pathsNormalized} rejected=${resolveResult.pathsRejected} ` +
        // inferred / still_missing を毎回残す。上流（レビュー出力書式）の対象行必須化が
        // 効いているかは still_missing の推移でしか読めず、inferred だけ見ていると
        // 「救えている」と「そもそも欠落が少ない」を取り違える。
        `inferred=${resolveResult.pathsInferred} still_missing=${resolveResult.pathsStillMissing}`,
    );
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: resolveReviewTargets failed`, err);
  }
}

function linkAddressesStep(acc: ReviewTotals, db: CaravanDbConnection, logger: CaravanLogger): void {
  try {
    const linkResult = linkAddresses({
      db,
      windowDays: 30,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    acc.totals.edges_inserted += linkResult.edges_inserted;
    // 内訳を毎回残す。対処率の改善施策（対象パスの必須化・照合強化）が効いたかは
    // この母集合の推移でしか読めないため、リンク 0 件でも省略しない。
    const skipped = linkResult.skipped;
    const skippedText = skipped === null
      ? 'skipped=unavailable'
      : `skipped_info=${skipped.severity_info} skipped_no_path=${skipped.no_target_path} skipped_unresolved_repo=${skipped.unresolved_repo}`;
    logger.info(
      `[anytime-memory] runReviewIncremental: linkAddresses ` +
        `candidates=${linkResult.candidates} linked=${linkResult.findings_linked} ` +
        `no_matching_commit=${linkResult.no_matching_commit} ${skippedText} ` +
        // シグナル別の内訳。テキスト以外の根拠で成立した割合が分からないと、
        // 対処率の変化が実態の改善なのか照合の緩和なのか読めない。
        `linked_session=${linkResult.linked_with_same_session} ` +
        `linked_review_marker=${linkResult.linked_with_review_marker}`,
    );
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: linkAddresses failed`, err);
  }
}

function linkPrecedesStep(acc: ReviewTotals, db: CaravanDbConnection, logger: CaravanLogger): void {
  try {
    const precedesResult = linkPrecedesBugs({
      db,
      windowDays: 60,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    acc.totals.edges_inserted += precedesResult.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runReviewIncremental: linkPrecedesBugs failed`, err);
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runReviewIncremental(input: {
  db: CaravanDbConnection;
  repoName: string;
  /**
   * Route B (レビュー会話セッション) の取込対象ワークスペース。Route A
   * (review .md) は reviewDir 自体がワークスペース固有なので影響しない。
   */
  workspaceScope: MemoryWorkspaceScope;
  /**
   * Route A が読む review .md のディレクトリ。**必須**。
   *
   * 省略可能にして内蔵既定へ倒すと、渡し忘れた経路が特定ワークスペースの絶対パスを
   * 黙って読み、設定していない環境では取込 0 件のまま success を返す
   * （2026-08-21 anytime-trade 実測）。解決は呼び出し元の責務にする。
   */
  reviewDir: string;
  ollama: OllamaClient;
  model?: string;
  /** chat model が使えるか。false なら category 推論を保留し取込だけ進める。既定 true。 */
  chatAvailable?: boolean;
  logger?: CaravanLogger;
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
  const reviewDir = input.reviewDir;
  const chatAvailable = input.chatAvailable ?? true;
  const force = input.force === true || process.env['MEMORY_CORE_REVIEW_FORCE'] === '1';
  if (force) {
    logger.info('[anytime-memory] runReviewIncremental: force re-ingest enabled (skip source_hash, reset session state)');
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const ledger = new PipelineRunLedger({ db, scope: SCOPE_DOC, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);
  upsertPipelineState(db, SCOPE_DOC, { status: 'running' });

  const acc: ReviewTotals = {
    totals: { items_processed: 0, entities_inserted: 0, edges_inserted: 0 },
    reviewsInserted: 0,
    findingsInserted: 0,
    itemsFailed: 0,
    reviewDirMissing: null,
  };
  const recordedAt = new Date().toISOString();
  const ctx: RouteContext = {
    db, repoName, workspaceScope: input.workspaceScope, ollama, model, chatAvailable,
    logger, recordedAt, force,
  };

  await runRouteADocs(acc, reviewDir, ctx);
  await runRouteBSessions(acc, ctx);

  // ── Post-processing: resolveReviewTargets → linkAddresses + linkPrecedesBugs ──
  await refinePendingCategoriesStep(acc, ctx);
  resolveTargetsStep(db, logger);
  linkAddressesStep(acc, db, logger);
  linkPrecedesStep(acc, db, logger);

  // ── Finalize ──────────────────────────────────────────────────────────────

  const { totals, reviewsInserted, findingsInserted, itemsFailed, reviewDirMissing } = acc;
  // 取込元が無い run は success にしない。失敗ではないが「取り込めていない」ことは同じで、
  // success で積むと設定漏れが台帳から永久に読めなくなる。
  const degraded = itemsFailed > 0 || reviewDirMissing !== null;
  const partialOrSuccess: 'partial' | 'success' = degraded ? 'partial' : 'success';
  const finalStatus: 'success' | 'partial' | 'error' =
    itemsFailed > 0 && totals.items_processed === itemsFailed ? 'error' : partialOrSuccess;

  const detailParts: string[] = [];
  if (reviewDirMissing !== null) detailParts.push(`review_dir_missing: ${reviewDirMissing}`);
  if (itemsFailed > 0) detailParts.push(`${itemsFailed} item(s) failed to ingest`);

  upsertPipelineState(db, SCOPE_DOC, { status: 'idle' });
  ledger.finish(finalStatus, totals, detailParts.join('; '));

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
