import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { discoverChangedSpecs } from '../ingest/spec/discoverSpecDocs';
import { parseFrontmatter } from '../ingest/spec/parseFrontmatter';
import { preFilterClaims } from '../ingest/spec/preFilterClaims';
import { extractClaims } from '../ingest/spec/extractClaims';
import { linkByC4Scope } from '../ingest/spec/linkByC4Scope';
import type { ExtractResult } from '../ingest/spec/extractClaims';
import { upsertSpecDoc, upsertSpecClaims, updateSpecDocSummary } from '../ingest/spec/persist';
import type { OllamaClient } from '../ollama/client';
import { noopLogger, type MemoryLogger } from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpecIncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  items_skipped: number;
  entities_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

export interface SpecIncrementalInput {
  db: Database;
  specRoot: string;
  ollama: OllamaClient;
  model?: string;
  logger?: MemoryLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE = 'spec_incremental';
const MAX_CONSECUTIVE_FAILURES = 5;

// ── Private helpers ───────────────────────────────────────────────────────────

function startPipelineRun(db: Database, scope: string, startedAt: string): string {
  const runId = createHash('sha1')
    .update(`${scope}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
  db.run(
    `INSERT OR REPLACE INTO memory_pipeline_runs
      (id, scope, started_at, status, items_processed, entities_inserted, entities_updated,
       edges_inserted, edges_invalidated, drifts_detected, items_failed, duration_ms, error_detail)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0, '')`,
    [runId, scope, startedAt],
  );
  return runId;
}

function finalizePipelineRun(
  db: Database,
  runId: string,
  opts: {
    status: string;
    finishedAt: string;
    durationMs: number;
    itemsProcessed: number;
    entitiesInserted: number;
    edgesInserted: number;
    itemsFailed: number;
    errorDetail?: string;
  },
): void {
  db.run(
    `UPDATE memory_pipeline_runs
     SET finished_at = ?,
         status = ?,
         duration_ms = ?,
         items_processed = ?,
         entities_inserted = ?,
         edges_inserted = ?,
         items_failed = ?,
         error_detail = ?
     WHERE id = ?`,
    [
      opts.finishedAt,
      opts.status,
      opts.durationMs,
      opts.itemsProcessed,
      opts.entitiesInserted,
      opts.edgesInserted,
      opts.itemsFailed,
      opts.errorDetail ?? '',
      runId,
    ],
  );
}

function upsertPipelineState(
  db: Database,
  scope: string,
  opts: { status: string; lastProcessedAt?: string; errorDetail?: string },
): void {
  db.run(
    `INSERT INTO memory_pipeline_state (scope, status, last_processed_at, error_detail)
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
  db: Database,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string,
  failedAt: string,
): void {
  db.run(
    `INSERT OR REPLACE INTO memory_failed_items
      (scope, item_key, failed_at, reason, detail)
     VALUES (?, ?, ?, ?, ?)`,
    [scope, itemKey, failedAt, reason, detail],
  );
}

function ensurePredicateExists(db: Database, predicate: string): void {
  db.run(
    `INSERT OR IGNORE INTO memory_relation_types
      (predicate, cardinality, directionality, description)
     VALUES (?, 'multiple_active', 'subject_to_object', 'spec extracted predicate')`,
    [predicate],
  );
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Incremental pipeline that discovers changed spec Markdown documents under
 * specRoot, extracts requirement claims via Ollama, and persists results into
 * the memory DB.
 */
export async function runSpecIncremental(
  input: SpecIncrementalInput,
): Promise<SpecIncrementalResult> {
  const { db, specRoot, ollama } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen3.5:9b';

  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();

  logger.info(`[${startedAt}] [INFO] [memory-core] runSpecIncremental: starting (specRoot=${specRoot})`);

  // 1. Insert running row into memory_pipeline_runs
  const runId = startPipelineRun(db, SCOPE, startedAt);

  let items_processed = 0;
  let items_skipped = 0;
  let entities_inserted = 0;
  let edges_inserted = 0;
  let items_failed = 0;
  let finalStatus: 'success' | 'partial' | 'error' = 'success';
  let consecutiveFailures = 0;
  let errorDetail = '';

  try {
    // 2. Discover changed specs
    const changedSpecs = await discoverChangedSpecs({ specRoot, db, logger });
    const total = changedSpecs.length;
    logger.info(`[${new Date().toISOString()}] [INFO] [memory-core] runSpecIncremental: discovered ${total} changed spec(s)`);

    // items_skipped = all MD files that were not in changedSpecs (hash matched)
    // We can't know the total without re-scanning, so we track skips from discoverChangedSpecs
    // For now, items_skipped is reported as 0 from the pipeline (discoverChangedSpecs already filtered)
    // The test verifies this via items_processed on the 2nd run being 0 and items_skipped being 1
    // We need to count skips ourselves by tracking total discovered vs changed
    // discoverChangedSpecs only returns changed files, so we compute skips separately
    // This would require modifying discoverChangedSpecs — instead we count from DB
    // For now we track items_skipped at a higher level using a separate query
    // (the test expects items_skipped=1 on 2nd run where discoverChangedSpecs returns [])
    // We set items_skipped = (total_md_files - changed_count) but that requires another scan
    // Simplest approach: items_skipped += 1 for each file not in changedSpecs
    // But we don't have that count here. We'll track via a helper count query.
    // Actually the simplest: run discoverChangedSpecs with a count-all variant.
    // For the test: 2nd run discoverChangedSpecs returns [] (0 changed), items_processed=0
    // We need items_skipped to be 1. We'll compute it via DB query after discoverChangedSpecs.

    // Count all md files currently tracked in memory_spec_documents (as a proxy for skips)
    // Actually the cleanest: count total_md_in_specRoot - changed_specs.length
    // We do a quick file count here.
    let totalMdCount = 0;
    try {
      const allEntries = fs.readdirSync(specRoot, { recursive: true }) as string[];
      totalMdCount = allEntries.filter((e) => typeof e === 'string' && e.endsWith('.md')).length;
    } catch {
      // ignore — specRoot may not exist in tests
    }
    items_skipped = Math.max(0, totalMdCount - changedSpecs.length);

    // 3. Process each changed spec
    for (const spec of changedSpecs) {
      const recordedAt = new Date().toISOString();
      try {
        // a. Read content
        let content: string;
        try {
          content = fs.readFileSync(spec.abs_path, 'utf-8');
        } catch (readErr) {
          const detail = readErr instanceof Error ? readErr.message : String(readErr);
          logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: failed to read ${spec.rel_path}`, readErr);
          recordFailedItem(db, 'spec', spec.rel_path, 'read_error', detail, recordedAt);
          items_failed++;
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            finalStatus = 'partial';
            logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: quarantine triggered after ${consecutiveFailures} consecutive failures`);
            break;
          }
          continue;
        }

        // b. Parse frontmatter
        const parsed = parseFrontmatter({ rel_path: spec.rel_path, content });
        if (!parsed) {
          const detail = 'parseFrontmatter returned null (invalid or missing frontmatter)';
          logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: ${detail} for ${spec.rel_path}`);
          recordFailedItem(db, 'spec', spec.rel_path, 'parse_error', detail, recordedAt);
          items_failed++;
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            finalStatus = 'partial';
            logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: quarantine triggered after ${consecutiveFailures} consecutive failures`);
            break;
          }
          continue;
        }

        // c. Pre-filter claims
        const { paragraphs } = preFilterClaims(parsed.body);

        // d. Extract claims via Ollama (only if paragraphs found)
        let extracted: ExtractResult = { summary: '', claims: [] };
        if (paragraphs.length > 0) {
          const extractResult = await extractClaims({
            paragraphs,
            c4Scope: parsed.frontmatter.c4Scope ?? [],
            ollama,
            model,
            logger,
          });
          if (!extractResult) {
            // LLM failure — check if it's a connection error
            const detail = 'extractClaims returned null (LLM failure)';
            logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: ${detail} for ${spec.rel_path}`);
            recordFailedItem(db, 'spec', spec.rel_path, 'llm_error', detail, recordedAt);
            items_failed++;
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              finalStatus = 'partial';
              logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: quarantine triggered after ${consecutiveFailures} consecutive failures`);
              break;
            }
            continue;
          }
          extracted = extractResult;
        }

        // e. Persist spec doc and entity
        const { specDocId, specEntityId } = upsertSpecDoc({
          db,
          parsed,
          source_hash: spec.source_hash,
          recordedAt,
        });

        // Update summary if we got one
        if (extracted.summary) {
          updateSpecDocSummary(db, specDocId, extracted.summary);
        }

        // f. Persist claims as edges
        // Ensure all predicates exist in memory_relation_types before inserting edges
        for (const claim of extracted.claims) {
          ensurePredicateExists(db, claim.predicate);
        }
        const claimResult = upsertSpecClaims({
          db,
          specDocId,
          specEntityId,
          claims: extracted.claims,
          recordedAt,
        });
        entities_inserted += claimResult.entities_inserted;
        edges_inserted += claimResult.edges_inserted;

        // g. Link C4 scope
        const c4Result = linkByC4Scope({
          db,
          specDocId,
          specEntityId,
          c4Scope: parsed.frontmatter.c4Scope ?? [],
          recordedAt,
          logger,
        });
        edges_inserted += c4Result.edges_inserted;

        // h. Count success
        items_processed++;
        consecutiveFailures = 0;

        logger.info(
          `[${recordedAt}] [INFO] [memory-core] runSpecIncremental: processed ${spec.rel_path} ` +
          `(entities_inserted=${claimResult.entities_inserted}, edges_inserted=${claimResult.edges_inserted + c4Result.edges_inserted})`,
        );
      } catch (err) {
        const isConnRefused =
          err instanceof Error &&
          (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed'));

        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);

        if (isConnRefused) {
          logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: LLM connection refused — aborting`, err);
          finalStatus = 'error';
          errorDetail = detail;
          recordFailedItem(db, 'spec', spec.rel_path, 'llm_connection_error', detail, recordedAt);
          items_failed++;
          break;
        }

        logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: unexpected error processing ${spec.rel_path}`, err);
        recordFailedItem(db, 'spec', spec.rel_path, 'unexpected_error', detail, recordedAt);
        items_failed++;
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          finalStatus = 'partial';
          logger.error(`[${recordedAt}] [ERROR] [memory-core] runSpecIncremental: quarantine triggered after ${consecutiveFailures} consecutive failures`);
          break;
        }
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    logger.error(`[${new Date().toISOString()}] [ERROR] [memory-core] runSpecIncremental: fatal error`, err);
    finalStatus = 'error';
    errorDetail = detail;
  }

  // 6. Finalize pipeline run
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  finalizePipelineRun(db, runId, {
    status: finalStatus,
    finishedAt,
    durationMs,
    itemsProcessed: items_processed,
    entitiesInserted: entities_inserted,
    edgesInserted: edges_inserted,
    itemsFailed: items_failed,
    errorDetail,
  });

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
    entities_inserted,
    edges_inserted,
    duration_ms: durationMs,
  };

  logger.info(
    `[${finishedAt}] [INFO] [memory-core] runSpecIncremental: done ` +
    `status=${finalStatus}, items_processed=${items_processed}, items_skipped=${items_skipped}, ` +
    `entities_inserted=${entities_inserted}, edges_inserted=${edges_inserted}, duration_ms=${durationMs}`,
  );

  return result;
}
