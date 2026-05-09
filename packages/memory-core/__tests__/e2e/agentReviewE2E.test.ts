/**
 * E2E tests for memory-core Phase 2.7: Route C — agent review ingestion.
 *
 * Case 1: 正常系 — 3 findings → success + DB rows
 * Case 2: zod 検証失敗 → status='error' + failed_items row
 * Case 3: 外部 endpoint 拒否 → status='rejected_external_endpoint'
 * Case 4: F21 merge — cosine ≥ 0.85 → merged_into set
 * Case 5: watchdog + subsequent ingest — stale run → error, new run succeeds
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../src/db/connection';
import { ingestAgentReviewResult } from '../../src/ingest/review/ingestAgentReviewResult';
import { runAgentRunWatchdog } from '../../src/ingest/review/agentRunWatchdog';
import { entityId } from '../../src/canonical/entityId';
import { noopLogger } from '../../src/logger';
import type { OllamaClient } from '../../src/ollama/client';

// ── Valid RFC 4122 UUIDs ───────────────────────────────────────────────────────

const RUN_CASE1   = '660e8400-e29b-41d4-a716-446655440001';
const RUN_CASE2   = '660e8400-e29b-41d4-a716-446655440002';
const RUN_CASE3   = '660e8400-e29b-41d4-a716-446655440003';
const RUN_CASE4   = '660e8400-e29b-41d4-a716-446655440004';
const RUN_CASE5A  = '660e8400-e29b-41d4-a716-446655440005'; // stale run
const RUN_CASE5B  = '660e8400-e29b-41d4-a716-446655440006'; // subsequent normal run

const TS_BASE = '2026-01-01T00:00:00.000Z';

// ── DB helper ─────────────────────────────────────────────────────────────────

async function openFresh(): Promise<{ db: Database; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `agent-e2e-${process.pid}-${Date.now()}.db`);
  process.env.MEMORY_CORE_DB_PATH = tmpPath;
  const { db, close } = await openMemoryCoreDb();
  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

function makeInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    run_id: RUN_CASE1,
    trigger_kind: 'manual',
    target_kind: 'code',
    target_refs: ['packages/web-app/src/Button.tsx'],
    model: 'qwen3.5:9b',
    prompt_kind: 'logic',
    prompt_hash: 'abc123',
    started_at: '2026-01-01T00:00:00.000Z',
    finished_at: '2026-01-01T00:01:00.000Z',
    input_tokens: 500,
    output_tokens: 800,
    gpu_used: '',
    ollama_endpoint: 'http://localhost:11434',
    findings: [],
    ...overrides,
  };
}

const noEmbeddingOllama: OllamaClient = {
  generate: async () => ({ response: '{}' }),
  embeddings: async () => ({ embedding: new Float32Array(0) }),
};

// ── Case 1: 正常系 ─────────────────────────────────────────────────────────────

test('Case 1: 3 findings → success, review_runs + reviews + findings rows', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeInput({
        run_id: RUN_CASE1,
        findings: [
          { finding_index: 0, category: 'a11y', severity: 'warn',
            target_file_path: 'packages/web-app/src/Button.tsx',
            target_symbol: null, target_line_start: 10, target_line_end: 12,
            finding_text: 'aria-label missing', suggestion_text: 'add aria-label', confidence: 0.9 },
          { finding_index: 1, category: 'logic', severity: 'error',
            target_file_path: 'packages/web-app/src/Button.tsx',
            target_symbol: 'handleClick', target_line_start: 25, target_line_end: 30,
            finding_text: 'null pointer dereference', suggestion_text: 'add null check', confidence: 0.85 },
          { finding_index: 2, category: 'perf', severity: 'info',
            target_file_path: null, target_symbol: null, target_line_start: null, target_line_end: null,
            finding_text: 'consider memoization', suggestion_text: 'use useMemo', confidence: 0.7 },
        ],
      }),
      ollama: noEmbeddingOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.findings_inserted).toBe(3);
    expect(result.findings_merged).toBe(0);
    expect(result.review_id).not.toBeNull();

    // memory_review_runs: 1 row, status=success
    const runRow = db.exec(
      `SELECT status, findings_count, findings_inserted FROM memory_review_runs WHERE id = ?`,
      [RUN_CASE1],
    );
    expect(runRow[0]?.values?.[0]?.[0]).toBe('success');
    expect(runRow[0]?.values?.[0]?.[1] as number).toBe(3);
    expect(runRow[0]?.values?.[0]?.[2] as number).toBe(3);

    // memory_reviews: source_kind='agent'
    const reviewRow = db.exec(
      `SELECT source_kind, target_kind FROM memory_reviews WHERE review_entity_id = ?`,
      [result.review_id!],
    );
    expect(reviewRow[0]?.values?.[0]?.[0]).toBe('agent');
    expect(reviewRow[0]?.values?.[0]?.[1]).toBe('code');

    // memory_review_findings: 3 rows
    const findingCount = db.exec(
      `SELECT COUNT(*) FROM memory_review_findings WHERE review_id = ?`,
      [result.review_id!],
    );
    expect(findingCount[0]?.values?.[0]?.[0] as number).toBe(3);

    // memory_edges: 3 'flagged' edges with INFERRED
    const edgeCount = db.exec(
      `SELECT COUNT(*) FROM memory_edges WHERE subject_entity_id = ? AND predicate = 'flagged'
         AND confidence_label = 'INFERRED'`,
      [result.review_id!],
    );
    expect(edgeCount[0]?.values?.[0]?.[0] as number).toBe(3);
  } finally {
    close();
  }
}, 30000);

// ── Case 2: zod 検証失敗 ──────────────────────────────────────────────────────

test('Case 2: invalid severity → status=error + failed_items row', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeInput({
        run_id: RUN_CASE2,
        findings: [
          { finding_index: 0, category: 'logic', severity: 'UNKNOWN',
            target_file_path: null, target_symbol: null,
            target_line_start: null, target_line_end: null,
            finding_text: 'bad finding', suggestion_text: 'fix it', confidence: 0.8 },
        ],
      }),
      ollama: noEmbeddingOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('error');
    expect(result.findings_inserted).toBe(0);

    const failedRow = db.exec(
      `SELECT COUNT(*) FROM memory_failed_items WHERE scope = 'review'`,
    );
    expect(failedRow[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(1);

    // No memory_review_runs row for this run_id (zod fails before INSERT)
    const noRunRow = db.exec(
      `SELECT COUNT(*) FROM memory_review_runs WHERE id = ?`,
      [RUN_CASE2],
    );
    expect(noRunRow[0]?.values?.[0]?.[0] as number).toBe(0);
  } finally {
    close();
  }
}, 30000);

// ── Case 3: 外部 endpoint 拒否 ─────────────────────────────────────────────────

test('Case 3: external endpoint → rejected_external_endpoint, no findings', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeInput({
        run_id: RUN_CASE3,
        ollama_endpoint: 'https://api.external-llm.com:11434',
        findings: [
          { finding_index: 0, category: 'logic', severity: 'warn',
            target_file_path: null, target_symbol: null,
            target_line_start: null, target_line_end: null,
            finding_text: 'should not be inserted', suggestion_text: 'n/a', confidence: 0.9 },
        ],
      }),
      ollama: noEmbeddingOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('rejected_external_endpoint');
    expect(result.findings_inserted).toBe(0);
    expect(result.error_detail).toContain('api.external-llm.com');

    // memory_review_runs: rejected row present
    const runRow = db.exec(
      `SELECT status FROM memory_review_runs WHERE id = ?`,
      [RUN_CASE3],
    );
    expect(runRow[0]?.values?.[0]?.[0]).toBe('rejected_external_endpoint');

    // No findings
    const findingCount = db.exec(
      `SELECT COUNT(*) FROM memory_review_findings rf
       JOIN memory_reviews r ON r.id = rf.review_id
       WHERE r.source_ref = ?`,
      [RUN_CASE3],
    );
    expect(findingCount[0]?.values?.[0]?.[0] as number).toBe(0);
  } finally {
    close();
  }
}, 30000);

// ── Case 4: F21 merge ─────────────────────────────────────────────────────────

test('Case 4: F21 merge — cosine ≥ 0.85 → merged_into set, findings_merged=1', async () => {
  const { db, close } = await openFresh();
  try {
    // Pre-insert an existing ReviewFinding entity with unit vector [1, 0, 0, 0]
    const unitVec = new Float32Array([1, 0, 0, 0]);
    const unitBlob = new Uint8Array(unitVec.buffer);
    const existingReviewId = 'existing-agent-review-aaa';
    const existingFindingEntityId = entityId('ReviewFinding', `${existingReviewId}:0`);
    const existingFindingRowId    = entityId('finding_row',    `${existingReviewId}:0`);

    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at, embedding)
       VALUES (?, 'ReviewFinding', ?, 'border 1px', '[]', '[]', '{}', ?, ?, ?, ?)`,
      [existingFindingEntityId, `${existingReviewId}:0`, TS_BASE, TS_BASE, TS_BASE, unitBlob],
    );
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, 'Existing Review', '[]', '[]', '{}', ?, ?, ?)`,
      [existingReviewId, existingReviewId, TS_BASE, TS_BASE, TS_BASE],
    );
    db.run(
      `INSERT OR IGNORE INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, 'agent', 'old-run-id', ?, 'code', 'Old Review', ?, ?)`,
      [existingReviewId, existingReviewId, TS_BASE, TS_BASE],
    );
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_symbol, category, severity, finding_text, suggestion_text, recorded_at)
       VALUES (?, ?, ?, 0, 'packages/web-app/src/foo.ts', NULL, 'design', 'warn',
               'border 1px', 'use theme token', ?)`,
      [existingFindingRowId, existingReviewId, existingFindingEntityId, TS_BASE],
    );

    // Mock ollama returns same unit vector → cosine = 1.0 ≥ 0.85 → merge
    const mergingOllama: OllamaClient = {
      generate: async () => ({ response: '{}' }),
      embeddings: async () => ({ embedding: Float32Array.from([1, 0, 0, 0]) }),
    };

    const result = await ingestAgentReviewResult({
      db,
      input: makeInput({
        run_id: RUN_CASE4,
        findings: [
          { finding_index: 0, category: 'design', severity: 'warn',
            target_file_path: 'packages/web-app/src/foo.ts',
            target_symbol: null, target_line_start: null, target_line_end: null,
            finding_text: 'border thickness 1px is hard-coded', suggestion_text: 'use design token',
            confidence: 0.88 },
        ],
      }),
      ollama: mergingOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.findings_merged).toBe(1);

    // New finding entity has merged_into set
    const newReviewEntityId = entityId('Review', RUN_CASE4);
    const newFindingEntityId = entityId('ReviewFinding', `${newReviewEntityId}:0`);
    const attrsRow = db.exec(
      `SELECT attributes_json FROM memory_entities WHERE id = ?`,
      [newFindingEntityId],
    );
    const attrs = JSON.parse(attrsRow[0]?.values?.[0]?.[0] as string);
    expect(attrs.merged_into).toBe(existingFindingEntityId);

    // memory_review_runs.findings_merged = 1
    const runRow = db.exec(
      `SELECT findings_merged FROM memory_review_runs WHERE id = ?`,
      [RUN_CASE4],
    );
    expect(runRow[0]?.values?.[0]?.[0] as number).toBe(1);
  } finally {
    close();
  }
}, 30000);

// ── Case 5: watchdog + subsequent ingest ──────────────────────────────────────

test('Case 5: stale run → watchdog error/timeout, then new ingest succeeds independently', async () => {
  const { db, close } = await openFresh();
  try {
    const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

    // Insert a stale 'running' row manually
    db.run(
      `INSERT INTO memory_review_runs
         (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash,
          started_at, status, recorded_at)
       VALUES (?, 'cron', 'code', 'qwen3.5:9b', 'logic', 'abc', ?, 'running', ?)`,
      [RUN_CASE5A, elevenMinAgo, elevenMinAgo],
    );

    // Watchdog should find and timeout the stale row
    const watchdogResult = runAgentRunWatchdog({ db, timeoutMinutes: 10, logger: noopLogger });
    expect(watchdogResult.stale_count).toBe(1);

    const staleRow = db.exec(
      `SELECT status, error_detail FROM memory_review_runs WHERE id = ?`,
      [RUN_CASE5A],
    );
    expect(staleRow[0]?.values?.[0]?.[0]).toBe('error');
    expect(staleRow[0]?.values?.[0]?.[1]).toBe('timeout');

    // Subsequent normal ingest (different run_id) should succeed without interference
    const result = await ingestAgentReviewResult({
      db,
      input: makeInput({
        run_id: RUN_CASE5B,
        findings: [
          { finding_index: 0, category: 'security', severity: 'error',
            target_file_path: 'packages/api/src/auth.ts',
            target_symbol: null, target_line_start: 5, target_line_end: 8,
            finding_text: 'JWT token not validated', suggestion_text: 'add jwt.verify()',
            confidence: 0.95 },
        ],
      }),
      ollama: noEmbeddingOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.findings_inserted).toBe(1);

    // Total runs: stale (error/timeout) + new (success)
    const totalRuns = db.exec(`SELECT COUNT(*) FROM memory_review_runs`);
    expect(totalRuns[0]?.values?.[0]?.[0] as number).toBe(2);
  } finally {
    close();
  }
}, 30000);
