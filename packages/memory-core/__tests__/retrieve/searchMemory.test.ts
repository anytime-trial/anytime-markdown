import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { searchMemory } from '../../src/retrieve/searchMemory';
import { encodeEmbedding } from '../../src/embedding/codec';
import type { OllamaClient } from '../../src/ollama/client';

// Helper: create an in-memory db with migrations applied
async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const now = new Date().toISOString();

function insertEntity(
  db: Database,
  id: string,
  canonicalName: string,
  displayName: string,
  summary: string,
  embedding: Float32Array
): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Tool', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?, ?)`,
    [id, canonicalName, displayName, summary, blob, now, now, now]
  );
}

describe('searchMemory', () => {
  let db: Database;
  let mockOllama: OllamaClient;

  beforeEach(async () => {
    db = await createTestDb();

    // Insert 3 entities with orthogonal embeddings
    insertEntity(db, 'id1', 'jest', 'Jest', 'A test runner', Float32Array.from([1, 0, 0]));
    insertEntity(db, 'id2', 'typescript', 'TypeScript', 'A typed language', Float32Array.from([0, 1, 0]));
    insertEntity(db, 'id3', 'python', 'Python', 'A scripting language', Float32Array.from([0, 0, 1]));

    // Mock ollama returns embedding matching entity 1
    mockOllama = {
      embeddings: jest.fn().mockResolvedValue({ embedding: Float32Array.from([1, 0, 0]) }),
      generate: jest.fn(),
    };
  });

  afterEach(() => {
    db.close();
  });

  test('S1: returns entity with highest cosine score first', async () => {
    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'test runner', limit: 3 },
    });

    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    expect(result.entities[0].id).toBe('id1');
    expect(result.entities[0].score).toBeCloseTo(1.0, 4);
    expect(result.entities[0].display_name).toBe('Jest');
  });

  test('S2: hops=0 returns no edges or episodes', async () => {
    // Insert an active edge to verify it is NOT returned
    const edgeNow = new Date().toISOString();
    db.run(
      `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_hops0', 'id1', 'relates_to', 'id2', ?, ?, 'conversation', 'ep1', '{}')`,
      [edgeNow, edgeNow]
    );

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'test', hops: 0 },
    });

    expect(result.edges).toHaveLength(0);
    expect(result.episodes).toHaveLength(0);
  });

  test('S3: hops=1 returns only active edges (expired excluded)', async () => {
    const edgeNow = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    // Active edge: valid_to IS NULL
    db.run(
      `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_active', 'id1', 'relates_to', 'id2', ?, ?, 'conversation', 'ep1', '{}')`,
      [edgeNow, edgeNow]
    );

    // Expired edge: valid_to is set
    db.run(
      `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_expired', 'id1', 'relates_to', 'id3', ?, ?, ?, 'conversation', 'ep1', '{}')`,
      [yesterday, edgeNow, edgeNow]
    );

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'test', hops: 1, limit: 3 },
    });

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain('edge_active');
    expect(edgeIds).not.toContain('edge_expired');
    expect(result.edges[0].subject_id).toBe('id1');
    expect(result.edges[0].predicate).toBe('relates_to');
  });

  test('S4: entity_types filter limits results to matching types', async () => {
    // Insert a 'Person' entity — should be excluded when filtering for Tool
    const personEmbed = encodeEmbedding(Float32Array.from([1, 0, 0]));
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
       VALUES ('person1', 'Person', 'alice', 'Alice', '[]', '[]', '{}', 'A person', ?, ?, ?, ?)`,
      [personEmbed, now, now, now]
    );

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'tool', entity_types: ['Tool'], limit: 10 },
    });

    const types = result.entities.map((e) => e.type);
    expect(types.every((t) => t === 'Tool')).toBe(true);
    expect(result.entities.some((e) => e.id === 'person1')).toBe(false);
  });
});
