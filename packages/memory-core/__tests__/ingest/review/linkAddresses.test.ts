import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { linkAddresses } from '../../../src/ingest/review/linkAddresses';
import { entityId } from '../../../src/canonical/entityId';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_NAME = 'anytime-markdown';
const TS_BASE = '2026-01-01T00:00:00.000Z';
// 1 day after base
const TS_PLUS_1 = '2026-01-02T00:00:00.000Z';
// 31 days after base (outside default 30-day window)
const TS_PLUS_31 = '2026-02-01T00:00:00.000Z';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath(suffix = '') {
  return path.join(
    os.tmpdir(),
    `la-test-${process.pid}-${Date.now()}${suffix}.db`
  );
}

function makeLogger() {
  return { warn: jest.fn() };
}

type SetupResult = {
  db: Database;
  findingId: string;
  findingEntityId: string;
  reviewEntityId: string;
  trailHandle: Database;
  close: () => void;
};

async function buildSetup(opts: {
  findingText: string;
  severity: 'info' | 'warn' | 'error';
  targetFilePath: string | null;
  addressedAt?: string | null;
  commitFile?: string;
  commitMessage?: string;
  commitAt?: string;
  repoName?: string;
}): Promise<SetupResult> {
  const {
    findingText,
    severity,
    targetFilePath,
    addressedAt = null,
    commitFile,
    commitMessage,
    commitAt,
    repoName = REPO_NAME,
  } = opts;

  const tmpPath = makeTmpPath();
  process.env.MEMORY_CORE_DB_PATH = tmpPath;

  // 1. Open memory-core DB
  const { db, close: closeMain } = await openMemoryCoreDb();

  // 2. Build trail DB in-memory
  const SQL = await initSqlJs();
  const trailHandle: Database = new SQL.Database();
  trailHandle.run('PRAGMA foreign_keys = ON');
  trailHandle.run(`CREATE TABLE session_commits (
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    repo_name TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    repo_name TEXT NOT NULL
  ) STRICT`);

  if (commitFile && commitMessage && commitAt) {
    const hash = 'abc123def456';
    trailHandle.run(
      `INSERT INTO session_commits (commit_hash, commit_message, committed_at, repo_name) VALUES (?, ?, ?, ?)`,
      [hash, commitMessage, commitAt, repoName]
    );
    trailHandle.run(
      `INSERT INTO commit_files (commit_hash, file_path, repo_name) VALUES (?, ?, ?)`,
      [hash, commitFile, repoName]
    );
  }

  attachTrailDbFromHandle(db, trailHandle);

  // 3. Insert prerequisite memory_entities for review entity
  const reviewEntityId = entityId('Concept', 'test-review-entity');
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, 'Test Review', ?, ?, ?)`,
    [reviewEntityId, 'test-review-entity', TS_BASE, TS_BASE, TS_BASE]
  );

  // 4. Insert memory_reviews
  const reviewId = 'rv-test-1';
  db.run(
    `INSERT OR IGNORE INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, 'review_doc', 'review/test.md', ?, 'code', 'Test Review', ?, ?)`,
    [reviewId, reviewEntityId, TS_BASE, TS_BASE]
  );

  // 5. Insert memory_entities for finding entity (using Concept as allowed type)
  const findingCanonicalName = `test-finding-${Date.now()}`;
  const findingEntityId = entityId('Concept', findingCanonicalName);
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, 'Test Finding', ?, ?, ?)`,
    [findingEntityId, findingCanonicalName, TS_BASE, TS_BASE, TS_BASE]
  );

  // 6. Insert memory_review_findings
  const findingId = 'rf-test-1';
  if (addressedAt !== null) {
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, severity, finding_text, recorded_at, addressed_at, addressed_commit_sha)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 'already-addressed-sha')`,
      [findingId, reviewId, findingEntityId, targetFilePath, severity, findingText, TS_BASE, addressedAt]
    );
  } else {
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, severity, finding_text, recorded_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      [findingId, reviewId, findingEntityId, targetFilePath, severity, findingText, TS_BASE]
    );
  }

  return {
    db,
    findingId,
    findingEntityId,
    reviewEntityId,
    trailHandle,
    close: () => {
      trailHandle.close();
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('linkAddresses', () => {
  // Test 1: Happy path
  test('happy path — matching commit sets addressed fields and inserts edge', async () => {
    const { db, findingId, findingEntityId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, logger });

    expect(result.findings_linked).toBe(1);
    expect(result.edges_inserted).toBe(1);

    // Check addressed_commit_sha and addressed_at are set
    const rows = db.exec(
      `SELECT addressed_commit_sha, addressed_at FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    const values = rows[0]?.values[0];
    expect(values?.[0]).toBe('abc123def456');
    expect(values?.[1]).not.toBeNull();
    expect(typeof values?.[1]).toBe('string');

    // Check edge exists
    const commitEntityId = entityId('Commit', 'abc123def456');
    const edges = db.exec(
      `SELECT COUNT(*) FROM memory_edges WHERE predicate='addresses' AND subject_entity_id=? AND object_entity_id=?`,
      [commitEntityId, findingEntityId]
    );
    expect(edges[0]?.values[0][0]).toBe(1);

    // Verify edge metadata
    const edgeRows = db.exec(
      `SELECT subject_entity_id, predicate, object_entity_id,
              confidence, confidence_label, modality, source_type, source_ref
       FROM memory_edges WHERE predicate = 'addresses'`
    );
    expect(edgeRows[0]?.values?.length).toBe(1);
    const [subjectId, predicate, objectId, confidence, confidenceLabel, modality, sourceType, sourceRef] = edgeRows[0]!.values[0]!;
    expect(predicate).toBe('addresses');
    expect(objectId).toBe(findingEntityId);
    expect(confidence).toBeCloseTo(0.7, 5);
    expect(confidenceLabel).toBe('INFERRED');
    expect(modality).toBe('asserted');
    expect(sourceType).toBe('review');
    expect(sourceRef).toBe(`review_finding#${findingId}`);

    close();
  }, 30000);

  // Test 2: No keyword match
  test('no keyword match — commit is skipped', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'chore: update deps',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain NULL
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // Test 3: Outside window
  test('outside window — commit beyond windowDays is not linked', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_31,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, windowDays: 30, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain NULL
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // Test 4: Severity 'info' excluded
  test('severity info — finding is not processed', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'info',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  // Test 5: target_file_path IS NULL
  test('target_file_path null — finding is excluded', async () => {
    const { db, close } = await buildSetup({
      findingText: 'some finding text',
      severity: 'warn',
      targetFilePath: null,
      commitFile: 'src/foo.ts',
      commitMessage: 'fix: some finding text',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  // Test 6: Already addressed
  test('already addressed — finding is not re-processed', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      addressedAt: TS_BASE, // already set
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, repoName: REPO_NAME, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain the original value
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBe('already-addressed-sha');

    close();
  }, 30000);
});
