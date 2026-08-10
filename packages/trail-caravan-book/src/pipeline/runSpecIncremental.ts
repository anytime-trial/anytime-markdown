import * as fs from 'node:fs';
import type { CaravanDbConnection } from '../db/connection/types';
import { discoverChangedSpecs } from '../ingest/spec/discoverSpecDocs';
import { parseFrontmatter } from '../ingest/spec/parseFrontmatter';
import { preFilterClaims } from '../ingest/spec/preFilterClaims';
import { extractClaims } from '../ingest/spec/extractClaims';
import { linkByC4Scope } from '../ingest/spec/linkByC4Scope';
import type { ExtractResult } from '../ingest/spec/extractClaims';
import { upsertSpecDoc, upsertSpecClaims, updateSpecDocSummary } from '../ingest/spec/persist';
import { summarizeSpecDoc } from '../ingest/spec/summarizeSpecDoc';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import { noopLogger, type CaravanLogger } from '../logger';
import { PipelineRunLedger } from './PipelineRunLedger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpecIncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  entities_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

export interface SpecIncrementalInput {
  db: CaravanDbConnection;
  specRoot: string;
  ollama: OllamaClient;
  model?: string;
  logger?: CaravanLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE = 'spec_incremental';
const MAX_CONSECUTIVE_FAILURES = 5;
const PROGRESS_LOG_INTERVAL = 50;

// ── Private helpers ───────────────────────────────────────────────────────────

function upsertPipelineState(
  db: CaravanDbConnection,
  scope: string,
  opts: { status: string; lastProcessedAt?: string; errorDetail?: string },
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
    [scope, opts.status, opts.lastProcessedAt ?? '', opts.errorDetail ?? ''],
  );
}

function recordFailedItem(
  db: CaravanDbConnection,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string,
  failedAt: string,
): void {
  db.run(
    `INSERT OR REPLACE INTO caravan_failed_items
      (scope, item_key, failed_at, reason, detail)
     VALUES (?, ?, ?, ?, ?)`,
    [scope, itemKey, failedAt, reason, detail],
  );
}

function ensurePredicateExists(db: CaravanDbConnection, predicate: string): void {
  db.run(
    `INSERT OR IGNORE INTO caravan_relation_types
      (predicate, cardinality, directionality, description)
     VALUES (?, 'multiple_active', 'subject_to_object', 'spec extracted predicate')`,
    [predicate],
  );
}

/**
 * Records a failed spec item and checks if the quarantine threshold is reached.
 * Returns true when caller should break the loop (quarantine triggered).
 */
function recordAndCheckQuarantine(opts: {
  db: CaravanDbConnection;
  scope: string;
  itemKey: string;
  reason: string;
  detail: string;
  recordedAt: string;
  consecutiveFailures: number;
  maxConsecutive: number;
  logger: CaravanLogger;
}): boolean {
  const { db, scope, itemKey, reason, detail, recordedAt, consecutiveFailures, maxConsecutive, logger } = opts;
  recordFailedItem(db, scope, itemKey, reason, detail, recordedAt);
  if (consecutiveFailures >= maxConsecutive) {
    logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: quarantine triggered after ${consecutiveFailures} consecutive failures`);
    return true;
  }
  return false;
}

/** discoverChangedSpecs が返す 1 件（abs_path / rel_path / source_hash）。 */
type ChangedSpec = Awaited<ReturnType<typeof discoverChangedSpecs>>[number];

/**
 * spec 1 件の処理結果。旧実装のループ内 `break` / `continue` を戻り値へ写したもの。
 * 集計（items_* / consecutiveFailures / finalStatus）は呼び出し側だけが持つ。
 */
type SpecItemOutcome =
  | { kind: 'processed' }
  | { kind: 'skipped' }
  /** quarantined が true のとき呼び出し側は finalStatus='partial' で打ち切る。 */
  | { kind: 'failed'; quarantined: boolean }
  /** LLM 接続断。呼び出し側は finalStatus='error' で打ち切る。 */
  | { kind: 'fatal'; detail: string };

interface SpecItemContext {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  model: string;
  logger: CaravanLogger;
  /** 直前までの連続失敗数。quarantine 判定は「これ + 1」で行う（旧実装の ++ 後判定と同値）。 */
  consecutiveFailures: number;
  /**
   * 挿入件数の集計。**書き込んだ直後にここへ加算する**。戻り値で返して呼び出し側で
   * 足す形にすると、後続の手順（linkByC4Scope 等）が throw したときに、既に DB へ
   * 書き込み済みの件数が報告から丸ごと消える（書き込み自体は巻き戻らない）。
   */
  inserted: { entities: number; edges: number };
}

/** 失敗を記録し、quarantine 到達なら打ち切りを求める outcome を返す。 */
function failSpecItem(
  ctx: SpecItemContext,
  args: { relPath: string; reason: string; detail: string; recordedAt: string },
): SpecItemOutcome {
  const quarantined = recordAndCheckQuarantine({
    db: ctx.db,
    scope: 'spec',
    itemKey: args.relPath,
    reason: args.reason,
    detail: args.detail,
    recordedAt: args.recordedAt,
    consecutiveFailures: ctx.consecutiveFailures + 1,
    maxConsecutive: MAX_CONSECUTIVE_FAILURES,
    logger: ctx.logger,
  });
  return { kind: 'failed', quarantined };
}

/** parseFrontmatter が成功時に返す本体（frontmatter + body）。 */
type ParsedSpec = Extract<ReturnType<typeof parseFrontmatter>, { ok: true }>['data'];

type SpecLoad = { ok: true; parsed: ParsedSpec } | { ok: false; outcome: SpecItemOutcome };

/** a. 本文読み込み ＋ b. フロントマター解析。 */
function loadSpec(spec: ChangedSpec, ctx: SpecItemContext, recordedAt: string): SpecLoad {
  let content: string;
  try {
    content = fs.readFileSync(spec.abs_path, 'utf-8');
  } catch (readErr) {
    const detail = readErr instanceof Error ? readErr.message : String(readErr);
    ctx.logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: failed to read ${spec.rel_path}`, readErr);
    return { ok: false, outcome: failSpecItem(ctx, { relPath: spec.rel_path, reason: 'read_error', detail, recordedAt }) };
  }

  const parseResult = parseFrontmatter({ rel_path: spec.rel_path, content });
  if (parseResult.ok) return { ok: true, parsed: parseResult.data };

  if (parseResult.reason === 'missing') {
    // No --- block: legacy file without frontmatter — soft skip, not a transient failure
    ctx.logger.warn?.(`[${recordedAt}] [WARN] [anytime-memory] runSpecIncremental: skipping ${spec.rel_path} (no frontmatter)`);
    return { ok: false, outcome: { kind: 'skipped' } };
  }
  // reason === 'invalid': has --- block but zod validation failed — data quality issue
  const detail = `parseFrontmatter invalid: ${parseResult.detail}`;
  ctx.logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: ${detail} for ${spec.rel_path}`);
  return { ok: false, outcome: failSpecItem(ctx, { relPath: spec.rel_path, reason: 'parse_error', detail, recordedAt }) };
}

/** e〜h: spec ドキュメント・claim・C4 スコープの永続化。 */
async function persistSpec(
  spec: ChangedSpec,
  ctx: SpecItemContext,
  args: { parsed: ParsedSpec; extracted: ExtractResult; recordedAt: string },
): Promise<SpecItemOutcome> {
  const { parsed, extracted, recordedAt } = args;
  const { specDocId, specEntityId } = upsertSpecDoc({
    db: ctx.db,
    parsed,
    source_hash: spec.source_hash,
    recordedAt,
  });

  // Update summary: 文書全体を読ませる専用要約を優先し、失敗時のみ
  // claim 抽出の副産物 summary にフォールバックする（新規 doc で空要約を避ける）。
  const docSummary = await summarizeSpecDoc({
    title: parsed.frontmatter.title,
    body: parsed.body,
    ollama: ctx.ollama,
    model: ctx.model,
    logger: ctx.logger,
  });
  const summaryToPersist = docSummary ?? extracted.summary;
  if (summaryToPersist) {
    updateSpecDocSummary(ctx.db, specDocId, summaryToPersist);
  }

  // Ensure all predicates exist in caravan_relation_types before inserting edges
  for (const claim of extracted.claims) {
    ensurePredicateExists(ctx.db, claim.predicate);
  }
  const claimResult = upsertSpecClaims({
    db: ctx.db,
    specDocId,
    specEntityId,
    claims: extracted.claims,
    recordedAt,
  });
  ctx.inserted.entities += claimResult.entities_inserted;
  ctx.inserted.edges += claimResult.edges_inserted;

  const c4Result = linkByC4Scope({
    db: ctx.db,
    specDocId,
    specEntityId,
    c4Scope: parsed.frontmatter.c4Scope ?? [],
    recordedAt,
    logger: ctx.logger,
  });
  ctx.inserted.edges += c4Result.edges_inserted;

  ctx.logger.info(
    `[${recordedAt}] [INFO] [anytime-memory] runSpecIncremental: processed ${spec.rel_path} ` +
    `(entities_inserted=${claimResult.entities_inserted}, edges_inserted=${claimResult.edges_inserted + c4Result.edges_inserted})`,
  );
  return { kind: 'processed' };
}

/** 想定外例外の振り分け。LLM 接続断だけは即時打ち切り（fatal）にする。 */
function classifySpecError(
  err: unknown,
  spec: ChangedSpec,
  ctx: SpecItemContext,
  recordedAt: string,
): SpecItemOutcome {
  const isConnRefused =
    err instanceof Error &&
    (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed'));
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);

  if (isConnRefused) {
    ctx.logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: LLM connection refused — aborting`, err);
    recordFailedItem(ctx.db, 'spec', spec.rel_path, 'llm_connection_error', detail, recordedAt);
    return { kind: 'fatal', detail };
  }

  ctx.logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: unexpected error processing ${spec.rel_path}`, err);
  return failSpecItem(ctx, { relPath: spec.rel_path, reason: 'unexpected_error', detail, recordedAt });
}

/** 変更された spec 1 件を読み・抽出し・永続化する（a〜h）。 */
async function processChangedSpec(spec: ChangedSpec, ctx: SpecItemContext): Promise<SpecItemOutcome> {
  const recordedAt = new Date().toISOString();
  try {
    const loaded = loadSpec(spec, ctx, recordedAt);
    if (!loaded.ok) return loaded.outcome;

    // c. Pre-filter claims
    const { paragraphs } = preFilterClaims(loaded.parsed.body);

    // d. Extract claims via Ollama (only if paragraphs found)
    let extracted: ExtractResult = { summary: '', claims: [] };
    if (paragraphs.length > 0) {
      const extractResult = await extractClaims({
        paragraphs,
        c4Scope: loaded.parsed.frontmatter.c4Scope ?? [],
        ollama: ctx.ollama,
        model: ctx.model,
        logger: ctx.logger,
      });
      if (!extractResult) {
        // LLM failure — check if it's a connection error
        const detail = 'extractClaims returned null (LLM failure)';
        ctx.logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecIncremental: ${detail} for ${spec.rel_path}`);
        return failSpecItem(ctx, { relPath: spec.rel_path, reason: 'llm_error', detail, recordedAt });
      }
      extracted = extractResult;
    }

    return await persistSpec(spec, ctx, { parsed: loaded.parsed, extracted, recordedAt });
  } catch (err) {
    return classifySpecError(err, spec, ctx, recordedAt);
  }
}

/** specRoot 配下の .md 総数（変更なし件数＝items_skipped の算出に使う）。 */
function countMarkdownFiles(specRoot: string): number {
  try {
    const allEntries = fs.readdirSync(specRoot, { recursive: true }) as string[];
    return allEntries.filter((e) => typeof e === 'string' && e.endsWith('.md')).length;
  } catch {
    // specRoot が無い（テスト等）ときは 0 件扱い。走査不能は失敗ではない。
    return 0;
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Incremental pipeline that discovers changed spec Markdown documents under
 * specRoot, extracts requirement claims via Ollama, and persists results into
 * the caravan-book DB.
 */
export async function runSpecIncremental(
  input: SpecIncrementalInput,
): Promise<SpecIncrementalResult> {
  const { db, specRoot, ollama } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';

  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();

  logger.info(`[${startedAt}] [INFO] [anytime-memory] runSpecIncremental: starting (specRoot=${specRoot})`);

  // 1. Insert running row into caravan_pipeline_runs
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);

  let items_processed = 0;
  let items_skipped = 0;
  const inserted = { entities: 0, edges: 0 };
  let items_failed = 0;
  let finalStatus: 'success' | 'partial' | 'error' = 'success';
  let consecutiveFailures = 0;
  let errorDetail = '';

  try {
    // 2. Discover changed specs
    const changedSpecs = await discoverChangedSpecs({ specRoot, db, logger });
    const total = changedSpecs.length;
    logger.info(`[${new Date().toISOString()}] [INFO] [anytime-memory] runSpecIncremental: discovered ${total} changed spec(s)`);

    // discoverChangedSpecs は変更のあった spec だけを返すため、スキップ数はここで
    // 「specRoot 配下の .md 総数 − 変更件数」として求める（DB 側に総数を持たないため）。
    items_skipped = Math.max(0, countMarkdownFiles(specRoot) - changedSpecs.length);

    // 3. Process each changed spec
    logger.info(`[anytime-memory] spec incremental: ${changedSpecs.length} changed specs to process`);
    let processedCount = 0;
    for (const spec of changedSpecs) {
      processedCount += 1;
      if (processedCount % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `[anytime-memory] spec incremental progress: ${processedCount}/${changedSpecs.length} ` +
            `(failed=${items_failed})`
        );
      }
      const outcome = await processChangedSpec(spec, {
        db, ollama, model, logger, consecutiveFailures, inserted,
      });

      if (outcome.kind === 'processed') {
        items_processed++;
        consecutiveFailures = 0;
        continue;
      }
      if (outcome.kind === 'skipped') {
        items_skipped++;
        continue;
      }
      if (outcome.kind === 'fatal') {
        finalStatus = 'error';
        errorDetail = outcome.detail;
        items_failed++;
        break;
      }
      items_failed++;
      consecutiveFailures++;
      if (outcome.quarantined) {
        finalStatus = 'partial';
        break;
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    logger.error(`[${new Date().toISOString()}] [ERROR] [anytime-memory] runSpecIncremental: fatal error`, err);
    finalStatus = 'error';
    errorDetail = detail;
  }

  // 6. Finalize pipeline run
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  ledger.finish(
    finalStatus,
    {
      items_processed,
      entities_inserted: inserted.entities,
      edges_inserted: inserted.edges,
      items_failed,
    },
    errorDetail,
  );

  // 7. Upsert pipeline state
  upsertPipelineState(db, SCOPE, {
    status: 'idle',
    lastProcessedAt: finishedAt,
    errorDetail,
  });

  const result: SpecIncrementalResult = {
    status: finalStatus,
    items_processed,
    items_skipped,
    items_failed,
    entities_inserted: inserted.entities,
    edges_inserted: inserted.edges,
    duration_ms: durationMs,
  };

  logger.info(
    `[${finishedAt}] [INFO] [anytime-memory] runSpecIncremental: done ` +
    `status=${finalStatus}, items_processed=${items_processed}, items_skipped=${items_skipped}, ` +
    `entities_inserted=${inserted.entities}, edges_inserted=${inserted.edges}, duration_ms=${durationMs}`,
  );

  return result;
}
