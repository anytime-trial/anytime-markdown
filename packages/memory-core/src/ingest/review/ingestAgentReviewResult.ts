import type { MemoryDbConnection, SqlValue } from '../../db/connection/types';
import { toUint8ArrayOrNull } from '../../db/connection/blobUtil';
import { AgentReviewInputSchema } from '../../types/AgentReviewInput';
import { entityId } from '../../canonical/entityId';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { MemoryLogger } from '../../logger';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MERGE_THRESHOLD = 0.85;
const EMBEDDING_MODEL = 'bge-m3';

export interface IngestAgentReviewResult {
  status: 'success' | 'partial' | 'error' | 'rejected_external_endpoint';
  review_id: string | null;
  findings_inserted: number;
  findings_merged: number;
  error_detail: string;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Convert Uint8Array (BLOB from sql.js) back to Float32Array
function blobToFloat32(blob: Uint8Array): Float32Array {
  const result = new Float32Array(Math.floor(blob.byteLength / 4));
  new Uint8Array(result.buffer).set(blob.slice(0, result.byteLength));
  return result;
}

function recordFailedItem(
  db: MemoryDbConnection,
  scope: string,
  itemKey: string,
  reason: string,
  detail: string,
): void {
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [scope, itemKey, new Date().toISOString(), reason, detail],
  );
}

/** F21: find an existing finding entity id whose embedding is similar enough to merge into. */
async function computeMergeTarget(
  candidateRows: readonly (readonly SqlValue[])[],
  findingText: string,
  ollama: OllamaClient,
  logger: MemoryLogger,
): Promise<string | null> {
  let newEmbedding: Float32Array;
  try {
    const embResult = await ollama.embeddings({ model: EMBEDDING_MODEL, prompt: findingText });
    newEmbedding = embResult.embedding;
  } catch (_) {
    logger.warn?.(
      `[anytime-memory] ingestAgentReviewResult: embedding failed`,
    );
    return null;
  }
  if (newEmbedding.length === 0) return null;
  for (const row of candidateRows) {
    const existingEntityId = row[0] as string;
    const existingBlob = toUint8ArrayOrNull(row[1]);
    if (!existingBlob || existingBlob.byteLength === 0) continue;
    const existingEmbedding = blobToFloat32(existingBlob);
    if (cosineSimilarity(newEmbedding, existingEmbedding) >= MERGE_THRESHOLD) {
      return existingEntityId;
    }
  }
  return null;
}

/** Insert one finding (entity + row + edge), returning whether it was inserted and/or merged. */
async function ingestOneFinding(opts: {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  logger: MemoryLogger;
  finding: {
    finding_index: number;
    target_file_path: string | null;
    target_symbol: string | null;
    target_line_start: number | null;
    target_line_end: number | null;
    category: string;
    severity: string;
    finding_text: string;
    suggestion_text: string | null;
  };
  reviewEntityId: string;
  runId: string;
  recordedAt: string;
}): Promise<{ inserted: boolean; merged: boolean; failed: boolean; failDetail: string }> {
  const { db, ollama, logger, finding, reviewEntityId, runId, recordedAt } = opts;
  try {
    const findingCanonicalName = `${reviewEntityId}:${finding.finding_index}`;
    const findingEntityId = entityId('ReviewFinding', findingCanonicalName);

    // F21: look for existing findings with matching file/symbol/category
    const candidates = db.exec(
      `SELECT mrf.finding_entity_id, me.embedding
       FROM memory_review_findings mrf
       JOIN memory_entities me ON me.id = mrf.finding_entity_id
       WHERE mrf.target_file_path IS ?
         AND mrf.target_symbol IS ?
         AND mrf.category = ?
         AND mrf.review_id != ?`,
      [finding.target_file_path, finding.target_symbol, finding.category, reviewEntityId],
    );
    const candidateRows = candidates[0]?.values ?? [];
    const mergedInto =
      candidateRows.length > 0
        ? await computeMergeTarget(candidateRows, finding.finding_text, ollama, logger)
        : null;

    const attributesJson = mergedInto
      ? JSON.stringify({ merged_into: mergedInto, confidence_label: 'INFERRED' })
      : JSON.stringify({ confidence_label: 'INFERRED' });

    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, ?, '[]', '[]', ?, ?, ?, ?)`,
      [
        findingEntityId, findingCanonicalName,
        finding.finding_text.slice(0, 100),
        attributesJson, recordedAt, recordedAt, recordedAt,
      ],
    );
    if (mergedInto) {
      db.run(
        `UPDATE memory_entities SET attributes_json = ?, last_updated_at = ?
         WHERE id = ? AND type = 'ReviewFinding'`,
        [attributesJson, recordedAt, findingEntityId],
      );
    }

    const findingRowId = entityId('finding_row', findingCanonicalName);
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_symbol, target_line_start, target_line_end,
          category, severity, finding_text, suggestion_text, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        findingRowId, reviewEntityId, findingEntityId, finding.finding_index,
        finding.target_file_path, finding.target_symbol,
        finding.target_line_start, finding.target_line_end,
        finding.category, finding.severity,
        finding.finding_text, finding.suggestion_text,
        recordedAt,
      ],
    );
    const inserted = db.getRowsModified() > 0;

    const edgeId = entityId('edge', `flagged:${reviewEntityId}:${findingEntityId}`);
    db.run(
      `INSERT OR IGNORE INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality)
       VALUES (?, ?, 'flagged', ?, ?, NULL, ?, 'review', ?, 1.0, 'INFERRED', 'asserted')`,
      [
        edgeId, reviewEntityId, findingEntityId,
        recordedAt, recordedAt,
        `agent#${runId}`,
      ],
    );
    return { inserted, merged: mergedInto !== null, failed: false, failDetail: '' };
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.error(
      `[anytime-memory] ingestAgentReviewResult: failed finding ${finding.finding_index}`,
      err,
    );
    return { inserted: false, merged: false, failed: true, failDetail: detail };
  }
}

export async function ingestAgentReviewResult(input: {
  db: MemoryDbConnection;
  input: unknown;
  ollama: OllamaClient;
  logger: MemoryLogger;
}): Promise<IngestAgentReviewResult> {
  const { db, ollama, logger } = input;
  const recordedAt = new Date().toISOString();

  // ── Step 1: zod validation ────────────────────────────────────────────────

  const parseResult = AgentReviewInputSchema.safeParse(input.input);
  if (!parseResult.success) {
    const rawRunId = (input.input as Record<string, unknown>)?.run_id;
    const runId = typeof rawRunId === 'string' ? rawRunId : 'unknown';
    const detail = JSON.stringify(parseResult.error.issues);
    logger.error(
      `[anytime-memory] ingestAgentReviewResult: zod validation failed run_id=${runId}`,
      parseResult.error,
    );
    recordFailedItem(db, 'review', runId, 'zod_error', detail);
    return {
      status: 'error',
      review_id: null,
      findings_inserted: 0,
      findings_merged: 0,
      error_detail: detail,
    };
  }

  const parsed = parseResult.data;

  // ── Step 2: D22 endpoint check ─────────────────────────────────────────────

  let endpointHost: string;
  try {
    endpointHost = new URL(parsed.ollama_endpoint).hostname;
  } catch (_) {
    endpointHost = '';
  }

  if (!ALLOWED_HOSTS.has(endpointHost)) {
    logger.error(
      `[anytime-memory] ingestAgentReviewResult: rejected external endpoint=${parsed.ollama_endpoint}`,
    );
    const durationMs =
      new Date(parsed.finished_at).getTime() - new Date(parsed.started_at).getTime();
    db.run(
      `INSERT OR IGNORE INTO memory_review_runs
         (id, trigger_kind, target_kind, target_refs_json, model, prompt_kind, prompt_hash,
          started_at, finished_at, duration_ms, status,
          input_tokens, output_tokens, gpu_used, error_detail, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected_external_endpoint', ?, ?, ?, ?, ?)`,
      [
        parsed.run_id, parsed.trigger_kind, parsed.target_kind,
        JSON.stringify(parsed.target_refs), parsed.model, parsed.prompt_kind, parsed.prompt_hash,
        parsed.started_at, parsed.finished_at, durationMs,
        parsed.input_tokens, parsed.output_tokens, parsed.gpu_used,
        parsed.ollama_endpoint, recordedAt,
      ],
    );
    return {
      status: 'rejected_external_endpoint',
      review_id: null,
      findings_inserted: 0,
      findings_merged: 0,
      error_detail: parsed.ollama_endpoint,
    };
  }

  // ── Step 3: Insert memory_review_runs as 'running' ────────────────────────

  const durationMs =
    new Date(parsed.finished_at).getTime() - new Date(parsed.started_at).getTime();
  db.run(
    `INSERT OR IGNORE INTO memory_review_runs
       (id, trigger_kind, target_kind, target_refs_json, model, prompt_kind, prompt_hash,
        started_at, finished_at, duration_ms, status,
        input_tokens, output_tokens, gpu_used, error_detail, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, '', ?)`,
    [
      parsed.run_id, parsed.trigger_kind, parsed.target_kind,
      JSON.stringify(parsed.target_refs), parsed.model, parsed.prompt_kind, parsed.prompt_hash,
      parsed.started_at, parsed.finished_at, durationMs,
      parsed.input_tokens, parsed.output_tokens, parsed.gpu_used, recordedAt,
    ],
  );

  // ── Step 4: Create Review entity ──────────────────────────────────────────

  const reviewEntityId = entityId('Review', parsed.run_id);
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [
      reviewEntityId, parsed.run_id,
      `Agent review ${parsed.run_id.slice(0, 8)}`,
      recordedAt, recordedAt, recordedAt,
    ],
  );

  // ── Step 5: Insert memory_reviews row (source_kind='agent') ───────────────

  db.run(
    `INSERT OR IGNORE INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id,
        target_kind, target_refs_json, title, reviewed_at, recorded_at)
     VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?)`,
    [
      reviewEntityId, parsed.run_id, reviewEntityId,
      parsed.target_kind, JSON.stringify(parsed.target_refs),
      `Agent review ${parsed.run_id.slice(0, 8)}`,
      parsed.finished_at, recordedAt,
    ],
  );

  // ── Step 6: Insert findings with F21 merge ────────────────────────────────

  let findingsInserted = 0;
  let findingsMerged = 0;
  let itemsFailed = 0;

  for (const finding of parsed.findings) {
    const result = await ingestOneFinding({
      db, ollama, logger, finding, reviewEntityId, runId: parsed.run_id, recordedAt,
    });
    if (result.failed) {
      itemsFailed += 1;
      recordFailedItem(db, 'review', `${parsed.run_id}#${finding.finding_index}`, 'finding_error', result.failDetail);
      continue;
    }
    if (result.inserted) findingsInserted += 1;
    if (result.merged) findingsMerged += 1;
  }

  // ── Step 7: Finalize memory_review_runs ───────────────────────────────────

  const partialOrSuccess: 'partial' | 'success' = itemsFailed > 0 ? 'partial' : 'success';
  const finalStatus: 'success' | 'partial' | 'error' =
    itemsFailed > 0 && itemsFailed === parsed.findings.length ? 'error' : partialOrSuccess;

  db.run(
    `UPDATE memory_review_runs SET
       status = ?, findings_count = ?, findings_inserted = ?, findings_merged = ?,
       review_id = ?
     WHERE id = ?`,
    [
      finalStatus, parsed.findings.length, findingsInserted, findingsMerged,
      reviewEntityId, parsed.run_id,
    ],
  );

  logger.info(
    `[anytime-memory] ingestAgentReviewResult: done run_id=${parsed.run_id} status=${finalStatus} ` +
      `findings_inserted=${findingsInserted} findings_merged=${findingsMerged}`,
  );

  return {
    status: finalStatus,
    review_id: reviewEntityId,
    findings_inserted: findingsInserted,
    findings_merged: findingsMerged,
    error_detail: '',
  };
}
