/**
 * Tests for src/ingest/review/persist.ts
 *
 * upsertReviewDoc, upsertReviewSession, upsertReviewFinding の
 * upsert・重複・更新・エラーハンドリングを検証する。
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import {
  upsertReviewDoc,
  upsertReviewSession,
  upsertReviewFinding,
} from '../../../src/ingest/review/persist';
import { entityId } from '../../../src/canonical/entityId';
import type { MemoryDbConnection } from '../../../src/db/connection/types';
import type { MemoryLogger } from '../../../src/logger';
import type { ParsedFinding } from '../../../src/ingest/review/findingHelpers';
import type { ParsedReviewDoc } from '../../../src/ingest/review/parseReviewDoc';
import type { ParsedReviewSession } from '../../../src/ingest/review/parseReviewSession';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TS = '2026-05-01T00:00:00.000Z';

function makeLogger(): MemoryLogger & { errors: unknown[]; warns: string[] } {
  const errors: unknown[] = [];
  const warns: string[] = [];
  return {
    info: jest.fn(),
    error: jest.fn((_msg: string, err?: unknown) => { errors.push(err); }),
    warn: jest.fn((msg: string) => { warns.push(msg); }),
    errors,
    warns,
  };
}

async function openFresh(): Promise<{ db: MemoryDbConnection; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `review-persist-${process.pid}-${Date.now()}.db`);
  const { db, close } = await openMemoryCoreDb(tmpPath);
  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

function makeFinding(overrides: Partial<ParsedFinding> = {}): ParsedFinding {
  return {
    finding_index: 0,
    category: 'logic',
    severity: 'warn',
    target_file_path: 'src/foo.ts',
    target_symbol: null,
    target_line_start: 10,
    target_line_end: 20,
    finding_text: 'Some logic issue',
    suggestion_text: 'Fix it like this',
    ...overrides,
  };
}

function makeDoc(overrides: Partial<ParsedReviewDoc> = {}): ParsedReviewDoc {
  return {
    frontmatter: {
      title: 'Test Review',
      date: '2026-05-01',
      reviewer: 'claude',
      target_refs: [],
    },
    findings: [makeFinding()],
    targetRefs: ['src/foo.ts'],
    ...overrides,
  };
}

function makeSession(overrides: Partial<ParsedReviewSession> = {}): ParsedReviewSession {
  return {
    session_id: 'session-abc-123',
    message_uuid_start: '550e8400-e29b-41d4-a716-446655440000',
    target_kind: 'code',
    target_refs: ['src/bar.ts'],
    reviewed_at: TS,
    findings: [makeFinding({ finding_index: 0 })],
    ...overrides,
  };
}

// ── Setup helpers for upsertReviewFinding unit tests ──────────────────────────

/**
 * Inserts the minimum rows needed for upsertReviewFinding to succeed:
 *   memory_entities (Review) + memory_reviews
 */
async function openFreshWithReview(
  relPath: string,
): Promise<{ db: MemoryDbConnection; reviewEntityId: string; close: () => void }> {
  const { db, close } = await openFresh();
  const reviewEntityId = entityId('Review', relPath);

  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Review', ?, 'Test Review', '[]', '[]', '{}', ?, ?, ?)`,
    [reviewEntityId, relPath, TS, TS, TS],
  );
  db.run(
    `INSERT OR IGNORE INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, 'review_doc', ?, ?, 'code', 'Test Review', ?, ?)`,
    [reviewEntityId, relPath, reviewEntityId, TS, TS],
  );

  return { db, reviewEntityId, close };
}

// ── upsertReviewFinding ───────────────────────────────────────────────────────

describe('upsertReviewFinding', () => {
  test('inserts finding entity + finding row + flagged edge on first call', async () => {
    const { db, reviewEntityId, close } = await openFreshWithReview('test-review-doc.md');
    try {
      const logger = makeLogger();
      const finding = makeFinding();
      const result = upsertReviewFinding(db, reviewEntityId, finding, TS, logger);

      expect(result.inserted).toBe(true);
      expect(result.finding_entity_id).toBeTruthy();

      // memory_review_findings: 1 row
      const rows = db.exec(
        `SELECT finding_index, category, severity, finding_text FROM memory_review_findings WHERE review_id = ?`,
        [reviewEntityId],
      );
      expect(rows[0]?.values).toHaveLength(1);
      expect(rows[0].values[0][0]).toBe(0); // finding_index
      expect(rows[0].values[0][1]).toBe('logic');
      expect(rows[0].values[0][2]).toBe('warn');
      expect(rows[0].values[0][3]).toBe('Some logic issue');

      // memory_edges: flagged edge
      const edgeRows = db.exec(
        `SELECT predicate, subject_entity_id, object_entity_id FROM memory_edges WHERE predicate = 'flagged'`,
      );
      expect(edgeRows[0]?.values).toHaveLength(1);
      expect(edgeRows[0].values[0][1]).toBe(reviewEntityId);
      expect(edgeRows[0].values[0][2]).toBe(result.finding_entity_id);
    } finally {
      close();
    }
  });

  test('second call with same finding_index is no-op (INSERT OR IGNORE)', async () => {
    const { db, reviewEntityId, close } = await openFreshWithReview('idem-review.md');
    try {
      const logger = makeLogger();
      const finding = makeFinding();

      const r1 = upsertReviewFinding(db, reviewEntityId, finding, TS, logger);
      expect(r1.inserted).toBe(true);

      const r2 = upsertReviewFinding(db, reviewEntityId, finding, TS, logger);
      expect(r2.inserted).toBe(false); // INSERT OR IGNORE = no-op

      // Only 1 finding row in DB
      const count = db.exec(`SELECT COUNT(*) FROM memory_review_findings WHERE review_id = ?`, [reviewEntityId]);
      expect(count[0]?.values[0][0]).toBe(1);

      // Only 1 edge
      const edgeCount = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE predicate = 'flagged'`);
      expect(edgeCount[0]?.values[0][0]).toBe(1);
    } finally {
      close();
    }
  });

  test('finding with null target fields is handled', async () => {
    const { db, reviewEntityId, close } = await openFreshWithReview('null-fields.md');
    try {
      const logger = makeLogger();
      const finding = makeFinding({
        target_file_path: null,
        target_symbol: null,
        target_line_start: null,
        target_line_end: null,
      });
      const result = upsertReviewFinding(db, reviewEntityId, finding, TS, logger);

      expect(result.inserted).toBe(true);
      const rows = db.exec(
        `SELECT target_file_path, target_symbol, target_line_start, target_line_end
           FROM memory_review_findings WHERE review_id = ?`,
        [reviewEntityId],
      );
      expect(rows[0]?.values[0][0]).toBeNull();
      expect(rows[0]?.values[0][1]).toBeNull();
      expect(rows[0]?.values[0][2]).toBeNull();
      expect(rows[0]?.values[0][3]).toBeNull();
    } finally {
      close();
    }
  });
});

// ── upsertReviewDoc ───────────────────────────────────────────────────────────

describe('upsertReviewDoc', () => {
  test('new doc → is_new=true, findings_inserted=1, reviewed_by edge inserted', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc();
      const result = upsertReviewDoc(db, doc, 'review/2026-test.md', 'hash001', TS, logger);

      expect(result.is_new).toBe(true);
      expect(result.findings_inserted).toBe(1);
      expect(result.edges_inserted).toBeGreaterThanOrEqual(1); // flagged + reviewed_by

      // memory_reviews has 1 row
      const reviewRows = db.exec(
        `SELECT source_kind, source_hash, title FROM memory_reviews WHERE id = ?`,
        [result.review_id],
      );
      expect(reviewRows[0]?.values).toHaveLength(1);
      expect(reviewRows[0].values[0][0]).toBe('review_doc');
      expect(reviewRows[0].values[0][1]).toBe('hash001');
      expect(reviewRows[0].values[0][2]).toBe('Test Review');

      // reviewed_by edge from File entity
      const edgeRows = db.exec(
        `SELECT predicate FROM memory_edges WHERE predicate = 'reviewed_by'`,
      );
      expect(edgeRows[0]?.values).toHaveLength(1);
    } finally {
      close();
    }
  });

  test('same hash → returns is_new=false, no duplicate rows', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc();
      const r1 = upsertReviewDoc(db, doc, 'review/same-hash.md', 'hash-same', TS, logger);
      expect(r1.is_new).toBe(true);

      const r2 = upsertReviewDoc(db, doc, 'review/same-hash.md', 'hash-same', TS, logger);
      expect(r2.is_new).toBe(false);
      expect(r2.findings_inserted).toBe(0);

      const reviewCount = db.exec(`SELECT COUNT(*) FROM memory_reviews`);
      expect(reviewCount[0]?.values[0][0]).toBe(1);
    } finally {
      close();
    }
  });

  test('changed hash → source_hash is updated in memory_reviews', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc();

      // First ingest
      upsertReviewDoc(db, doc, 'review/changed.md', 'hash-v1', TS, logger);

      // Second ingest with different hash but same relPath
      const doc2 = makeDoc({
        frontmatter: { title: 'Test Review Updated', date: '2026-05-02', reviewer: 'claude', target_refs: [] },
        findings: [],
      });
      upsertReviewDoc(db, doc2, 'review/changed.md', 'hash-v2', TS, logger);

      const rows = db.exec(
        `SELECT source_hash FROM memory_reviews WHERE source_ref = 'review/changed.md'`,
      );
      expect(rows[0]?.values[0][0]).toBe('hash-v2');
    } finally {
      close();
    }
  });

  test('doc with no targetRefs → target_kind=mixed, no reviewed_by edges', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc({ targetRefs: [], findings: [] });
      const result = upsertReviewDoc(db, doc, 'review/no-refs.md', 'hash-norefs', TS, logger);

      expect(result.is_new).toBe(true);
      const rows = db.exec(`SELECT target_kind FROM memory_reviews WHERE id = ?`, [result.review_id]);
      expect(rows[0]?.values[0][0]).toBe('mixed');

      const edgeCount = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE predicate = 'reviewed_by'`);
      expect(edgeCount[0]?.values[0][0]).toBe(0);
    } finally {
      close();
    }
  });

  test('YYYY-MM-DD date in frontmatter → reviewed_at ends with T00:00:00.000Z', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc({
        frontmatter: { title: 'Date Test', date: '2026-04-15', reviewer: '', target_refs: [] },
        findings: [],
        targetRefs: [],
      });
      const result = upsertReviewDoc(db, doc, 'review/date-test.md', 'hash-date', TS, logger);

      const rows = db.exec(`SELECT reviewed_at FROM memory_reviews WHERE id = ?`, [result.review_id]);
      expect(rows[0]?.values[0][0]).toBe('2026-04-15T00:00:00.000Z');
    } finally {
      close();
    }
  });

  test('ISO 8601 with Z date → reviewed_at returned as-is', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const isoDate = '2026-04-15T12:34:56.000Z';
      const doc = makeDoc({
        frontmatter: { title: 'ISO Date', date: isoDate, reviewer: '', target_refs: [] },
        findings: [],
        targetRefs: [],
      });
      const result = upsertReviewDoc(db, doc, 'review/iso-date.md', 'hash-iso', TS, logger);

      const rows = db.exec(`SELECT reviewed_at FROM memory_reviews WHERE id = ?`, [result.review_id]);
      expect(rows[0]?.values[0][0]).toBe(isoDate);
    } finally {
      close();
    }
  });

  test('ISO 8601 without Z → converted to UTC via new Date().toISOString()', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      // ISO 8601 without trailing Z (line 28 branch)
      const isoNoZ = '2026-04-15T12:34:56+09:00';
      const doc = makeDoc({
        frontmatter: { title: 'ISO No Z', date: isoNoZ, reviewer: '', target_refs: [] },
        findings: [],
        targetRefs: [],
      });
      const result = upsertReviewDoc(db, doc, 'review/iso-no-z.md', 'hash-noz', TS, logger);

      const rows = db.exec(`SELECT reviewed_at FROM memory_reviews WHERE id = ?`, [result.review_id]);
      const reviewedAt = rows[0]?.values[0][0] as string;
      // Should end with Z after conversion
      expect(reviewedAt).toMatch(/Z$/);
    } finally {
      close();
    }
  });

  test('empty date string → reviewed_at is current ISO timestamp', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      // empty date (line 21 branch)
      const doc = makeDoc({
        frontmatter: { title: 'Empty Date', date: '', reviewer: '', target_refs: [] },
        findings: [],
        targetRefs: [],
      });
      const before = new Date().toISOString();
      const result = upsertReviewDoc(db, doc, 'review/empty-date.md', 'hash-empty-date', TS, logger);
      const after = new Date().toISOString();

      const rows = db.exec(`SELECT reviewed_at FROM memory_reviews WHERE id = ?`, [result.review_id]);
      const reviewedAt = rows[0]?.values[0][0] as string;
      expect(reviewedAt >= before).toBe(true);
      expect(reviewedAt <= after).toBe(true);
    } finally {
      close();
    }
  });

  test('non-standard date fallback → converted via new Date()', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      // fallback branch (line 35)
      const doc = makeDoc({
        frontmatter: { title: 'Weird Date', date: 'April 15 2026', reviewer: '', target_refs: [] },
        findings: [],
        targetRefs: [],
      });
      const result = upsertReviewDoc(db, doc, 'review/weird-date.md', 'hash-weird', TS, logger);

      const rows = db.exec(`SELECT reviewed_at FROM memory_reviews WHERE id = ?`, [result.review_id]);
      const reviewedAt = rows[0]?.values[0][0] as string;
      expect(reviewedAt).toMatch(/Z$/);
    } finally {
      close();
    }
  });

  test('multiple findings → findings_inserted matches count', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const doc = makeDoc({
        findings: [
          makeFinding({ finding_index: 0, category: 'logic' }),
          makeFinding({ finding_index: 1, category: 'security', severity: 'error' }),
          makeFinding({ finding_index: 2, category: 'a11y' }),
        ],
      });
      const result = upsertReviewDoc(db, doc, 'review/multi.md', 'hash-multi', TS, logger);

      expect(result.findings_inserted).toBe(3);

      const findingCount = db.exec(`SELECT COUNT(*) FROM memory_review_findings WHERE review_id = ?`, [result.review_id]);
      expect(findingCount[0]?.values[0][0]).toBe(3);
    } finally {
      close();
    }
  });
});

// ── upsertReviewSession ───────────────────────────────────────────────────────

describe('upsertReviewSession', () => {
  test('new session → is_new=true, findings_inserted=1', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const session = makeSession();
      const result = upsertReviewSession(db, session, TS, logger);

      expect(result.is_new).toBe(true);
      expect(result.findings_inserted).toBe(1);
      expect(result.review_id).toBeTruthy();

      // memory_reviews: source_kind='session'
      const rows = db.exec(
        `SELECT source_kind, target_kind FROM memory_reviews WHERE id = ?`,
        [result.review_id],
      );
      expect(rows[0]?.values[0][0]).toBe('session');
      expect(rows[0]?.values[0][1]).toBe('code');
    } finally {
      close();
    }
  });

  test('same session submitted twice → second is no-op', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const session = makeSession();

      const r1 = upsertReviewSession(db, session, TS, logger);
      expect(r1.is_new).toBe(true);
      expect(r1.findings_inserted).toBe(1);

      const r2 = upsertReviewSession(db, session, TS, logger);
      expect(r2.is_new).toBe(false);
      expect(r2.findings_inserted).toBe(0);

      const reviewCount = db.exec(`SELECT COUNT(*) FROM memory_reviews`);
      expect(reviewCount[0]?.values[0][0]).toBe(1);
    } finally {
      close();
    }
  });

  test('session with no findings → findings_inserted=0', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const session = makeSession({ findings: [] });
      const result = upsertReviewSession(db, session, TS, logger);

      expect(result.is_new).toBe(true);
      expect(result.findings_inserted).toBe(0);
      expect(result.edges_inserted).toBe(0);
    } finally {
      close();
    }
  });

  test('session review_id is derived from session_id + message_uuid_start', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const session = makeSession({
        session_id: 'my-session-001',
        message_uuid_start: 'aaaabbbb-cccc-dddd-eeee-ffff00001111',
      });
      const result = upsertReviewSession(db, session, TS, logger);

      // The source_ref in memory_reviews should match the canonical name
      const rows = db.exec(
        `SELECT source_ref FROM memory_reviews WHERE id = ?`,
        [result.review_id],
      );
      expect(rows[0]?.values[0][0]).toBe('my-session-001#aaaabbbb-cccc-dddd-eeee-ffff00001111');
    } finally {
      close();
    }
  });

  test('multiple findings in session → all persisted', async () => {
    const { db, close } = await openFresh();
    try {
      const logger = makeLogger();
      const session = makeSession({
        findings: [
          makeFinding({ finding_index: 0, category: 'logic' }),
          makeFinding({ finding_index: 1, category: 'design' }),
        ],
      });
      const result = upsertReviewSession(db, session, TS, logger);

      expect(result.findings_inserted).toBe(2);
      const count = db.exec(`SELECT COUNT(*) FROM memory_review_findings WHERE review_id = ?`, [result.review_id]);
      expect(count[0]?.values[0][0]).toBe(2);
    } finally {
      close();
    }
  });
});
