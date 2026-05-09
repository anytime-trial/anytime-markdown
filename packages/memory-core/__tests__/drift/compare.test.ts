import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { detectThreeSourceDrifts } from '../../src/drift/compare';
import type { MemoryLogger } from '../../src/logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

function makeDb(): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

let edgeSeq = 0;
function edgeId(): string {
  return `edge-${++edgeSeq}`;
}

/**
 * Insert a synthetic memory_edge. Inserts a placeholder entity first if needed.
 */
function insertEdge(
  db: Database,
  opts: {
    subject: string;
    predicate: string;
    objectLiteral: string;
    sourceType: 'conversation' | 'spec' | 'code';
    confidence?: number;
    validTo?: string | null;
  },
): void {
  const {
    subject,
    predicate,
    objectLiteral,
    sourceType,
    confidence = 0.8,
    validTo = null,
  } = opts;

  // Upsert subject entity (memory_entities.type has a CHECK; 'Package' is valid)
  db.run(
    `INSERT OR IGNORE INTO memory_entities
      (id, type, canonical_name, display_name, attributes_json, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Package', ?, ?, '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [subject, subject, subject],
  );

  db.run(
    `INSERT INTO memory_edges
      (id, subject_entity_id, predicate, object_entity_id, object_literal,
       valid_from, valid_to, recorded_at, source_type, source_ref,
       confidence, confidence_label, modality, attributes_json)
     VALUES (?, ?, ?, NULL, ?, '2026-01-01T00:00:00.000Z', ?, '2026-01-01T00:00:00.000Z', ?, 'test', ?, 'EXTRACTED', 'asserted', '{}')`,
    [edgeId(), subject, predicate, objectLiteral, validTo, sourceType, confidence],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('detectThreeSourceDrifts', () => {
  it('spec_vs_code: spec=zustand, code=redux, conv=redux → 1 candidate with drift_type=spec_vs_code', () => {
    const db = makeDb();
    insertEdge(db, { subject: 'entity-1', predicate: 'uses', objectLiteral: 'zustand', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-1', predicate: 'uses', objectLiteral: 'redux', sourceType: 'code' });
    insertEdge(db, { subject: 'entity-1', predicate: 'uses', objectLiteral: 'redux', sourceType: 'conversation' });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('spec_vs_code');
    expect(results[0].subject_entity_id).toBe('entity-1');
    expect(results[0].predicate).toBe('uses');
    expect(results[0].spec_value).toBe('zustand');
    expect(results[0].code_value).toBe('redux');
    expect(results[0].conversation_value).toBe('redux');
  });

  it('three_way: spec=react, code=vue, conv=angular → 1 candidate with drift_type=three_way', () => {
    const db = makeDb();
    insertEdge(db, { subject: 'entity-2', predicate: 'uses', objectLiteral: 'react', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-2', predicate: 'uses', objectLiteral: 'vue', sourceType: 'code' });
    insertEdge(db, { subject: 'entity-2', predicate: 'uses', objectLiteral: 'angular', sourceType: 'conversation' });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('three_way');
  });

  it('excludePredicates: relates_to is excluded by default', () => {
    const db = makeDb();
    insertEdge(db, { subject: 'entity-3', predicate: 'relates_to', objectLiteral: 'alpha', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-3', predicate: 'relates_to', objectLiteral: 'beta', sourceType: 'code' });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });

    expect(results).toHaveLength(0);
  });

  it('confidence filter: edges with confidence=0.5 are excluded (minConfidence=0.6 default)', () => {
    const db = makeDb();
    insertEdge(db, { subject: 'entity-4', predicate: 'uses', objectLiteral: 'alpha', sourceType: 'spec', confidence: 0.5 });
    insertEdge(db, { subject: 'entity-4', predicate: 'uses', objectLiteral: 'beta', sourceType: 'code', confidence: 0.5 });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });

    expect(results).toHaveLength(0);
  });

  it('normalization: React.js vs react are treated as equal (no drift)', () => {
    const db = makeDb();
    insertEdge(db, { subject: 'entity-5', predicate: 'uses', objectLiteral: 'React.js', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-5', predicate: 'uses', objectLiteral: 'react', sourceType: 'code' });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });

    // After normalization both become 'react'; no drift
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no edges exist', () => {
    const db = makeDb();
    const results = detectThreeSourceDrifts({ db, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('valid_to IS NOT NULL edges are excluded', () => {
    const db = makeDb();
    insertEdge(db, {
      subject: 'entity-6',
      predicate: 'uses',
      objectLiteral: 'alpha',
      sourceType: 'spec',
      validTo: '2026-01-02T00:00:00.000Z',
    });
    insertEdge(db, {
      subject: 'entity-6',
      predicate: 'uses',
      objectLiteral: 'beta',
      sourceType: 'code',
      validTo: '2026-01-02T00:00:00.000Z',
    });

    const results = detectThreeSourceDrifts({ db, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('custom excludePredicates overrides the default', () => {
    const db = makeDb();
    // 'depends_on' should be excluded via custom excludePredicates
    insertEdge(db, { subject: 'entity-7', predicate: 'depends_on', objectLiteral: 'x', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-7', predicate: 'depends_on', objectLiteral: 'y', sourceType: 'code' });
    // 'uses' should NOT be excluded because we overrode the default (not in custom list)
    insertEdge(db, { subject: 'entity-8', predicate: 'uses', objectLiteral: 'a', sourceType: 'spec' });
    insertEdge(db, { subject: 'entity-8', predicate: 'uses', objectLiteral: 'b', sourceType: 'code' });

    const results = detectThreeSourceDrifts({
      db,
      excludePredicates: ['depends_on'],
      logger: silentLogger,
    });

    // entity-7 excluded, entity-8 NOT excluded (uses not in custom list)
    expect(results).toHaveLength(1);
    expect(results[0].subject_entity_id).toBe('entity-8');
  });
});
