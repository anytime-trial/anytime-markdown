import type { Database } from 'sql.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { linkPrecedesBugs } from '../../../src/ingest/review/linkPrecedesBugs';
import { entityId } from '../../../src/canonical/entityId';

// ── Constants ─────────────────────────────────────────────────────────────────

const TS_FINDING = '2026-01-01T00:00:00.000Z';
// 45 days after finding — within default 60-day window
const TS_BUG_IN_WINDOW = '2026-02-15T00:00:00.000Z';
// 63 days after finding — outside default 60-day window
const TS_BUG_OUT_WINDOW = '2026-03-05T00:00:00.000Z';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath(suffix = '') {
  return path.join(
    os.tmpdir(),
    `lpb-test-${process.pid}-${Date.now()}${suffix}.db`
  );
}

function makeLogger() {
  return { warn: jest.fn() };
}

type SetupOpts = {
  findingTargetFilePath?: string | null;
  findingTargetSymbol?: string | null;
  findingSeverity?: 'info' | 'warn' | 'error';
  findingRecordedAt?: string;
  bugAffectedFiles?: string[];
  bugSubjectSummary?: string;
  bugCommittedAt?: string;
};

type SetupResult = {
  db: Database;
  findingId: string;
  findingEntityId: string;
  bugId: string;
  bugEntityId: string;
  close: () => void;
};

async function buildSetup(opts: SetupOpts = {}): Promise<SetupResult> {
  const {
    findingTargetFilePath = 'src/foo.ts',
    findingTargetSymbol = null,
    findingSeverity = 'warn',
    findingRecordedAt = TS_FINDING,
    bugAffectedFiles = ['src/foo.ts'],
    bugSubjectSummary = 'fix logic error in src/foo.ts',
    bugCommittedAt = TS_BUG_IN_WINDOW,
  } = opts;

  const tmpPath = makeTmpPath();
  process.env.MEMORY_CORE_DB_PATH = tmpPath;

  const { db, close: closeMain } = await openMemoryCoreDb();

  // ── 1. Bug entity ──────────────────────────────────────────────────────────
  const commitSha = 'abc123def456789a';
  const bugEntityId = entityId('Bug', commitSha);

  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, 'Test Bug', '[]', '[]', '{}', ?, ?, ?)`,
    [bugEntityId, commitSha, TS_FINDING, TS_FINDING, TS_FINDING]
  );

  // ── 2. ReviewFinding entity ────────────────────────────────────────────────
  const findingCanonicalName = `test-finding-${Date.now()}`;
  const findingEntityId = entityId('Concept', findingCanonicalName);

  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, 'Test Finding', '[]', '[]', '{}', ?, ?, ?)`,
    [findingEntityId, findingCanonicalName, TS_FINDING, TS_FINDING, TS_FINDING]
  );

  // ── 3. Review entity (FK for memory_reviews) ──────────────────────────────
  const reviewEntityId = entityId('Concept', 'test-review-entity');

  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', 'test-review-entity', 'Test Review', '[]', '[]', '{}', ?, ?, ?)`,
    [reviewEntityId, TS_FINDING, TS_FINDING, TS_FINDING]
  );

  // ── 4. memory_reviews row ─────────────────────────────────────────────────
  const reviewId = 'rv-lpb-test-1';

  db.run(
    `INSERT OR IGNORE INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, 'review_doc', 'review/test.md', ?, 'code', 'Test Review', ?, ?)`,
    [reviewId, reviewEntityId, TS_FINDING, TS_FINDING]
  );

  // ── 5. memory_review_findings row ─────────────────────────────────────────
  const findingId = 'rf-lpb-test-1';

  db.run(
    `INSERT OR IGNORE INTO memory_review_findings
       (id, review_id, finding_entity_id, finding_index,
        target_file_path, target_symbol, severity, finding_text, recorded_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, 'test finding text', ?)`,
    [
      findingId,
      reviewId,
      findingEntityId,
      findingTargetFilePath,
      findingTargetSymbol,
      findingSeverity,
      findingRecordedAt,
    ]
  );

  // ── 6. memory_bug_fixes row ───────────────────────────────────────────────
  const bugRowId = 'bf-lpb-test-1';

  db.run(
    `INSERT OR IGNORE INTO memory_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary,
        affected_file_paths_json, committed_at, recorded_at)
     VALUES (?, ?, ?, 'test-pkg', 'logic', ?, ?, ?, ?)`,
    [
      bugRowId,
      commitSha,
      bugEntityId,
      bugSubjectSummary,
      JSON.stringify(bugAffectedFiles),
      bugCommittedAt,
      TS_FINDING,
    ]
  );

  return {
    db,
    findingId,
    findingEntityId,
    bugId: bugRowId,
    bugEntityId,
    close: () => {
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('linkPrecedesBugs', () => {
  let teardown: (() => void) | undefined;
  afterEach(() => {
    teardown?.();
    teardown = undefined;
  });

  // Test 1: Happy path — file path match
  test('happy path — file path match inserts edge with correct metadata', async () => {
    const { db, findingId, findingEntityId, bugId, bugEntityId, close } =
      await buildSetup({
        findingTargetFilePath: 'src/foo.ts',
        findingSeverity: 'warn',
        findingRecordedAt: TS_FINDING,
        bugAffectedFiles: ['src/foo.ts'],
        bugCommittedAt: TS_BUG_IN_WINDOW,
      });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(1);

    // Verify edge exists with correct predicate
    const edges = db.exec(
      `SELECT predicate, subject_entity_id, object_entity_id,
              confidence, confidence_label, modality, source_type, source_ref
       FROM memory_edges WHERE predicate = 'precedes'`
    );
    expect(edges[0]?.values?.length).toBe(1);
    const [predicate, subjectId, objectId, confidence, confidenceLabel, modality, sourceType, sourceRef] =
      edges[0]!.values[0]!;

    expect(predicate).toBe('precedes');
    expect(subjectId).toBe(findingEntityId);
    expect(objectId).toBe(bugEntityId);
    expect(confidence).toBeCloseTo(0.7, 5);
    expect(confidenceLabel).toBe('INFERRED');
    expect(modality).toBe('asserted');
    expect(sourceType).toBe('review');
    expect(sourceRef).toBe(`review_finding#${findingId}=>bug#${bugId}`);

    expect(logger.warn).not.toHaveBeenCalled();
  }, 30000);

  // Test 2: Outside window — bug committed_at 63 days after finding.recorded_at
  test('outside window — bug beyond windowDays is not linked', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: 'src/foo.ts',
      findingSeverity: 'warn',
      findingRecordedAt: TS_FINDING,
      bugAffectedFiles: ['src/foo.ts'],
      bugCommittedAt: TS_BUG_OUT_WINDOW, // 63 days after
    });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(0);

    const edges = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE predicate = 'precedes'`);
    expect(edges[0]?.values[0][0]).toBe(0);
  }, 30000);

  // Test 3: severity 'info' excluded
  test('severity info — finding is not processed', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: 'src/foo.ts',
      findingSeverity: 'info',
      bugAffectedFiles: ['src/foo.ts'],
      bugCommittedAt: TS_BUG_IN_WINDOW,
    });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(0);
  }, 30000);

  // Test 4: Idempotent — second call inserts 0 edges (INSERT OR IGNORE)
  test('idempotent — second call inserts 0 edges', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: 'src/foo.ts',
      findingSeverity: 'warn',
      bugAffectedFiles: ['src/foo.ts'],
      bugCommittedAt: TS_BUG_IN_WINDOW,
    });
    teardown = close;

    const logger = makeLogger();

    const result1 = linkPrecedesBugs({ db, logger });
    expect(result1.edges_inserted).toBe(1);

    const result2 = linkPrecedesBugs({ db, logger });
    expect(result2.edges_inserted).toBe(0);

    // Only 1 edge in total
    const edges = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE predicate = 'precedes'`);
    expect(edges[0]?.values[0][0]).toBe(1);
  }, 30000);

  // Test 5: No file match — finding target_file_path differs from bug's affected files
  test('no file match — 0 edges inserted', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: 'src/bar.ts',
      findingTargetSymbol: null,
      findingSeverity: 'warn',
      bugAffectedFiles: ['src/foo.ts'], // different file
      bugCommittedAt: TS_BUG_IN_WINDOW,
    });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(0);
  }, 30000);

  // Bonus: severity 'error' also matches
  test('severity error — finding is processed', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: 'src/foo.ts',
      findingSeverity: 'error',
      bugAffectedFiles: ['src/foo.ts'],
      bugCommittedAt: TS_BUG_IN_WINDOW,
    });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(1);
  }, 30000);

  // Bonus: symbol match when file path doesn't match but symbol appears in subject_summary
  test('symbol match — target_symbol substring in subject_summary inserts edge', async () => {
    const { db, close } = await buildSetup({
      findingTargetFilePath: null,       // no file path
      findingTargetSymbol: 'calculateTotal',
      findingSeverity: 'warn',
      bugAffectedFiles: ['src/unrelated.ts'],
      bugSubjectSummary: 'fix(logic): calculateTotal returns wrong value',
      bugCommittedAt: TS_BUG_IN_WINDOW,
    });
    teardown = close;

    const logger = makeLogger();
    const result = linkPrecedesBugs({ db, logger });

    expect(result.edges_inserted).toBe(1);
  }, 30000);
});
