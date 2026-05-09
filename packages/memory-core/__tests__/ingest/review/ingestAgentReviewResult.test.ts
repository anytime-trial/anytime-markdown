import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { ingestAgentReviewResult } from '../../../src/ingest/review/ingestAgentReviewResult';
import { entityId } from '../../../src/canonical/entityId';
import { noopLogger } from '../../../src/logger';
import type { OllamaClient } from '../../../src/ollama/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_TS_START = '2026-01-01T00:00:00.000Z';
const MOCK_TS_END   = '2026-01-01T00:01:00.000Z';
// Valid RFC 4122 UUIDs (version=4, variant=8/9/a/b required by zod v4 uuid validator)
const VALID_UUID       = '550e8400-e29b-41d4-a716-446655440000';
const UUID_U18         = '550e8400-e29b-41d4-a716-446655440001';
const UUID_I22         = '550e8400-e29b-41d4-a716-446655440002';
const UUID_IDEM        = '550e8400-e29b-41d4-a716-446655440003';
const UUID_D22_LOCAL   = '550e8400-e29b-41d4-a716-446655440004';
const UUID_D22_127     = '550e8400-e29b-41d4-a716-446655440005';

const defaultMockOllama: OllamaClient = {
  generate: async () => ({ response: '{}' }),
  embeddings: async () => ({ embedding: new Float32Array(0) }),
};

function makeValidInput(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    run_id: VALID_UUID,
    trigger_kind: 'manual',
    target_kind: 'code',
    target_refs: ['packages/web-app/src/foo.ts'],
    model: 'qwen3.5:9b',
    prompt_kind: 'logic',
    prompt_hash: 'abc123',
    started_at: MOCK_TS_START,
    finished_at: MOCK_TS_END,
    input_tokens: 100,
    output_tokens: 200,
    gpu_used: '',
    ollama_endpoint: 'http://localhost:11434',
    findings: [],
    ...overrides,
  };
}

async function openFresh(): Promise<{ db: Database; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `ingest-agent-${process.pid}-${Date.now()}.db`);
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

// ── U16: D22 rejected_external_endpoint ───────────────────────────────────────

test('U16: remote ollama_endpoint → rejected_external_endpoint', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeValidInput({ ollama_endpoint: 'http://remote.example.com:11434' }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('rejected_external_endpoint');
    expect(result.findings_inserted).toBe(0);
    expect(result.error_detail).toContain('remote.example.com');

    const run = db.exec(
      `SELECT status FROM memory_review_runs WHERE id = ?`,
      [VALID_UUID],
    );
    expect(run[0]?.values?.[0]?.[0]).toBe('rejected_external_endpoint');
  } finally {
    close();
  }
}, 30000);

// ── U17: zod validation failure ───────────────────────────────────────────────

test('U17: invalid severity enum → zod error, status=error, failed_items row', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        findings: [
          {
            finding_index: 0,
            category: 'logic',
            severity: 'unknown',          // invalid enum value
            target_file_path: null,
            target_symbol: null,
            target_line_start: null,
            target_line_end: null,
            finding_text: 'some issue',
            suggestion_text: 'fix it',
            confidence: 0.9,
          },
        ],
      }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('error');
    expect(result.findings_inserted).toBe(0);
    expect(result.error_detail).not.toBe('');

    const failedItems = db.exec(
      `SELECT COUNT(*) FROM memory_failed_items WHERE scope = 'review'`,
    );
    expect(failedItems[0]?.values?.[0]?.[0] as number).toBeGreaterThanOrEqual(1);
  } finally {
    close();
  }
}, 30000);

// ── U18: F21 merge when cosine >= 0.85 ────────────────────────────────────────

test('U18: cosine 0.92 → merged_into set, findings_merged++', async () => {
  const { db, close } = await openFresh();
  try {
    const TS = '2026-01-01T00:00:00.000Z';
    const TARGET_FILE = 'packages/web-app/src/foo.ts';
    const CATEGORY = 'logic';

    // Use a simple unit vector [1, 0, 0, 0] for embeddings (cosine = 1.0 when both identical)
    const unitVec = new Float32Array([1, 0, 0, 0]);
    const unitBlob = new Uint8Array(unitVec.buffer);

    // Pre-insert a ReviewFinding entity with the unit vector embedding
    const existingReviewId = 'existing-review-id-aaa';
    const existingFindingEntityId = entityId('ReviewFinding', `${existingReviewId}:0`);
    const existingFindingRowId = entityId('finding_row', `${existingReviewId}:0`);

    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at, embedding)
       VALUES (?, 'ReviewFinding', ?, 'existing finding', '[]', '[]', '{}', ?, ?, ?, ?)`,
      [existingFindingEntityId, `${existingReviewId}:0`, TS, TS, TS, unitBlob],
    );
    // Need a review entity for the FK
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, 'Existing Review', '[]', '[]', '{}', ?, ?, ?)`,
      [existingReviewId, existingReviewId, TS, TS, TS],
    );
    // Need a memory_reviews row for the FK
    db.run(
      `INSERT OR IGNORE INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, 'review_doc', 'docs/old.md', ?, 'code', 'Old Review', ?, ?)`,
      [existingReviewId, existingReviewId, TS, TS],
    );
    // Pre-insert the finding row
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_symbol, category, severity, finding_text, suggestion_text, recorded_at)
       VALUES (?, ?, ?, 0, ?, NULL, ?, 'warn', 'old finding text', 'old suggestion', ?)`,
      [existingFindingRowId, existingReviewId, existingFindingEntityId, TARGET_FILE, CATEGORY, TS],
    );

    // Mock ollama returns the same unit vector → cosine = 1.0 ≥ 0.85 → merge
    const mergingMockOllama: OllamaClient = {
      generate: async () => ({ response: '{}' }),
      embeddings: async () => ({ embedding: Float32Array.from([1, 0, 0, 0]) }),
    };

    const result = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        run_id: UUID_U18,
        findings: [
          {
            finding_index: 0,
            category: CATEGORY,
            severity: 'warn',
            target_file_path: TARGET_FILE,
            target_symbol: null,
            target_line_start: null,
            target_line_end: null,
            finding_text: 'new finding text similar to old',
            suggestion_text: 'new suggestion',
            confidence: 0.9,
          },
        ],
      }),
      ollama: mergingMockOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.findings_merged).toBe(1);

    // Verify merged_into attribute is set
    const newReviewEntityId = entityId('Review', UUID_U18);
    const newFindingEntityId = entityId('ReviewFinding', `${newReviewEntityId}:0`);
    const attrs = db.exec(
      `SELECT attributes_json FROM memory_entities WHERE id = ?`,
      [newFindingEntityId],
    );
    const attrsJson = attrs[0]?.values?.[0]?.[0] as string;
    const parsedAttrs = JSON.parse(attrsJson);
    expect(parsedAttrs.merged_into).toBe(existingFindingEntityId);
  } finally {
    close();
  }
}, 30000);

// ── I22: successful ingestion ─────────────────────────────────────────────────

test('I22: valid 1-finding run → success, memory_review_runs + memory_reviews + finding', async () => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        run_id: UUID_I22,
        findings: [
          {
            finding_index: 0,
            category: 'a11y',
            severity: 'warn',
            target_file_path: 'packages/web-app/src/Button.tsx',
            target_symbol: null,
            target_line_start: 10,
            target_line_end: 15,
            finding_text: 'aria-label missing',
            suggestion_text: 'add aria-label="submit"',
            confidence: 0.95,
          },
        ],
      }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });

    expect(result.status).toBe('success');
    expect(result.review_id).not.toBeNull();
    expect(result.findings_inserted).toBe(1);
    expect(result.findings_merged).toBe(0);
    expect(result.error_detail).toBe('');

    // memory_review_runs: 1 row with status='success'
    const runRows = db.exec(
      `SELECT status, findings_count, findings_inserted FROM memory_review_runs WHERE id = ?`,
      [UUID_I22],
    );
    expect(runRows[0]?.values?.[0]?.[0]).toBe('success');
    expect(runRows[0]?.values?.[0]?.[1] as number).toBe(1);
    expect(runRows[0]?.values?.[0]?.[2] as number).toBe(1);

    // memory_reviews: 1 row with source_kind='agent'
    const reviewRows = db.exec(
      `SELECT source_kind FROM memory_reviews WHERE review_entity_id = ?`,
      [result.review_id!],
    );
    expect(reviewRows[0]?.values?.[0]?.[0]).toBe('agent');

    // memory_review_findings: 1 row
    const findingRows = db.exec(
      `SELECT COUNT(*) FROM memory_review_findings WHERE review_id = ?`,
      [result.review_id!],
    );
    expect(findingRows[0]?.values?.[0]?.[0] as number).toBe(1);

    // flagged edge: confidence_label='INFERRED'
    const edgeRows = db.exec(
      `SELECT confidence_label FROM memory_edges WHERE subject_entity_id = ? AND predicate = 'flagged'`,
      [result.review_id!],
    );
    expect(edgeRows[0]?.values?.[0]?.[0]).toBe('INFERRED');
  } finally {
    close();
  }
}, 30000);

// ── idempotency: same run_id twice → no-op ────────────────────────────────────

test('idempotency: same run_id submitted twice → second is no-op', async () => {
  const { db, close } = await openFresh();
  try {
    const firstResult = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        run_id: UUID_IDEM,
        findings: [
          {
            finding_index: 0,
            category: 'logic',
            severity: 'error',
            target_file_path: null,
            target_symbol: null,
            target_line_start: null,
            target_line_end: null,
            finding_text: 'logic error',
            suggestion_text: 'fix it',
            confidence: 0.8,
          },
        ],
      }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });
    expect(firstResult.findings_inserted).toBe(1);

    const secondResult = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        run_id: UUID_IDEM,
        findings: [
          {
            finding_index: 0,
            category: 'logic',
            severity: 'error',
            target_file_path: null,
            target_symbol: null,
            target_line_start: null,
            target_line_end: null,
            finding_text: 'logic error',
            suggestion_text: 'fix it',
            confidence: 0.8,
          },
        ],
      }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });
    // Second run: INSERT OR IGNORE on review_runs, reviews, entities, findings — all no-ops
    expect(secondResult.findings_inserted).toBe(0);

    // DB still has exactly 1 run row (INSERT OR IGNORE)
    const runCount = db.exec(
      `SELECT COUNT(*) FROM memory_review_runs WHERE id = ?`,
      [UUID_IDEM],
    );
    expect(runCount[0]?.values?.[0]?.[0] as number).toBe(1);
  } finally {
    close();
  }
}, 30000);

// ── D22: localhost variants ────────────────────────────────────────────────────

test.each([
  ['http://localhost:11434', UUID_D22_LOCAL],
  ['http://127.0.0.1:11434', UUID_D22_127],
])('D22: %s is accepted', async (endpoint, runId) => {
  const { db, close } = await openFresh();
  try {
    const result = await ingestAgentReviewResult({
      db,
      input: makeValidInput({
        run_id: runId,
        ollama_endpoint: endpoint,
        findings: [],
      }),
      ollama: defaultMockOllama,
      logger: noopLogger,
    });
    expect(result.status).toBe('success');
  } finally {
    close();
  }
}, 30000);
