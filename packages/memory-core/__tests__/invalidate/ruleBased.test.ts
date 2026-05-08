import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { applySingleActiveRule } from '../../src/invalidate/ruleBased';

let db: Database;

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

function insertEntity(d: Database, id: string): void {
  d.run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, id, id, NOW, NOW, NOW]
  );
}

function insertEdge(
  d: Database,
  id: string,
  subjectId: string,
  predicate: string,
  objectId: string,
  recordedAt: string
): void {
  d.run(
    `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, confidence, confidence_label, modality)
     VALUES (?, ?, ?, ?, ?, ?, 'conversation', 'ep1', 1.0, 'EXTRACTED', 'asserted')`,
    [id, subjectId, predicate, objectId, recordedAt, recordedAt]
  );
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);

  // Entities used across tests
  insertEntity(db, 'user1');
  insertEntity(db, 'react');
  insertEntity(db, 'vue');
  insertEntity(db, 'pkg1');
  insertEntity(db, 'user2');   // for isolated authored_by test
});

afterAll(() => {
  db.close();
});

describe('applySingleActiveRule', () => {
  test('single_active: old edge gets valid_to set, invalidation row added', () => {
    // Insert old active edge: user1 replaces react (valid_to IS NULL)
    insertEdge(db, 'edge-old', 'user1', 'replaces', 'react', NOW);

    // Insert the new edge: user1 replaces vue
    insertEdge(db, 'edge-new', 'user1', 'replaces', 'vue', LATER);

    const newEdge = {
      id: 'edge-new',
      subject_entity_id: 'user1',
      predicate: 'replaces',
      object_entity_id: 'vue',
      recorded_at: LATER,
    };
    const result = applySingleActiveRule(db, newEdge);

    expect(result.invalidated_edge_ids).toContain('edge-old');

    // old edge should have valid_to = LATER
    const oldEdgeRows = db.exec(`SELECT valid_to FROM memory_edges WHERE id = 'edge-old'`);
    expect(oldEdgeRows[0]?.values[0]?.[0]).toBe(LATER);

    // one invalidation row for edge-old
    const invRows = db.exec(
      `SELECT COUNT(*) FROM memory_edge_invalidations WHERE edge_id = 'edge-old'`
    );
    expect(invRows[0]?.values[0]?.[0]).toBe(1);
  });

  test('single_active: new edge itself is not invalidated (valid_to remains NULL)', () => {
    // edge-new was inserted in the previous test; it should still be active
    const rows = db.exec(`SELECT valid_to FROM memory_edges WHERE id = 'edge-new'`);
    expect(rows[0]?.values[0]?.[0]).toBeNull();
  });

  test('multiple_active: no invalidation occurs', () => {
    // depends_on is multiple_active — inserting a second active edge should not invalidate the first
    insertEdge(db, 'edge-dep1', 'user1', 'depends_on', 'pkg1', NOW);
    insertEdge(db, 'edge-dep2', 'user1', 'depends_on', 'react', LATER);

    const newEdge = {
      id: 'edge-dep2',
      subject_entity_id: 'user1',
      predicate: 'depends_on',
      object_entity_id: 'react',
      recorded_at: LATER,
    };
    const result = applySingleActiveRule(db, newEdge);

    expect(result.invalidated_edge_ids).toHaveLength(0);

    // edge-dep1 should still be active
    const rows = db.exec(`SELECT valid_to FROM memory_edges WHERE id = 'edge-dep1'`);
    expect(rows[0]?.values[0]?.[0]).toBeNull();
  });

  test('no existing active edge: no-op (zero invalidated)', () => {
    // user2 has no authored_by edge yet — inserting the first one should return empty
    insertEdge(db, 'edge-authored', 'user2', 'authored_by', 'react', NOW);

    const newEdge = {
      id: 'edge-authored',
      subject_entity_id: 'user2',
      predicate: 'authored_by',
      object_entity_id: 'react',
      recorded_at: NOW,
    };
    const result = applySingleActiveRule(db, newEdge);

    expect(result.invalidated_edge_ids).toHaveLength(0);
  });

  test('unknown predicate: no-op (zero invalidated)', () => {
    // A predicate not in memory_relation_types should return empty without error
    const newEdge = {
      id: 'edge-unknown',
      subject_entity_id: 'user1',
      predicate: 'nonexistent_predicate',
      object_entity_id: 'react',
      recorded_at: NOW,
    };
    const result = applySingleActiveRule(db, newEdge);
    expect(result.invalidated_edge_ids).toHaveLength(0);
  });
});
