import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { searchCaravanBook } from '../../src/retrieve/searchCaravanBook';
import { encodeEmbedding } from '../../src/embedding/codec';
import type { OllamaClient } from '@anytime-markdown/agent-core';

// Helper: create an in-memory db with migrations applied
async function createTestDb(): Promise<BetterSqlite3CaravanDb> {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const now = new Date().toISOString();

function insertEntity(
  db: BetterSqlite3CaravanDb,
  id: string,
  canonicalName: string,
  displayName: string,
  summary: string,
  embedding: Float32Array
): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Tool', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?, ?)`,
    [id, canonicalName, displayName, summary, blob, now, now, now]
  );
}

describe('searchCaravanBook', () => {
  let db: BetterSqlite3CaravanDb;
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
    const result = await searchCaravanBook({
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
      `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_hops0', 'id1', 'relates_to', 'id2', ?, ?, 'conversation', 'ep1', '{}')`,
      [edgeNow, edgeNow]
    );

    const result = await searchCaravanBook({
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
      `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_active', 'id1', 'relates_to', 'id2', ?, ?, 'conversation', 'ep1', '{}')`,
      [edgeNow, edgeNow]
    );

    // Expired edge: valid_to is set
    db.run(
      `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at, source_type, source_ref, attributes_json)
       VALUES ('edge_expired', 'id1', 'relates_to', 'id3', ?, ?, ?, 'conversation', 'ep1', '{}')`,
      [yesterday, edgeNow, edgeNow]
    );

    const result = await searchCaravanBook({
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
      `INSERT INTO caravan_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
       VALUES ('person1', 'Person', 'alice', 'Alice', '[]', '[]', '{}', 'A person', ?, ?, ?, ?)`,
      [personEmbed, now, now, now]
    );

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'tool', entity_types: ['Tool'], limit: 10 },
    });

    const types = result.entities.map((e) => e.type);
    expect(types.every((t) => t === 'Tool')).toBe(true);
    expect(result.entities.some((e) => e.id === 'person1')).toBe(false);
  });

  it('valid_until がセットされた entity を検索結果から除外する', async () => {
    // id1 を soft-delete
    db.run(`UPDATE caravan_entities SET valid_until = ? WHERE id = ?`, [now, 'id1']);

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'jest', limit: 10 },
    });

    expect(result.entities.some((e) => e.id === 'id1')).toBe(false);
  });
});

// ---- 2026-08-09 検索経路修理のリグレッションテスト（proposal 20260809-knowledge-graph-utilization）----

function insertEntityAt(
  db: BetterSqlite3CaravanDb,
  id: string,
  displayName: string,
  embedding: Float32Array,
  lastUpdatedAt: string,
  summary = ''
): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Tool', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?, ?)`,
    [id, id, displayName, summary, blob, lastUpdatedAt, lastUpdatedAt, lastUpdatedAt]
  );
}

function insertEdge(db: BetterSqlite3CaravanDb, id: string, subj: string, obj: string): void {
  const t = new Date().toISOString();
  db.run(
    `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref, attributes_json)
     VALUES (?, ?, 'relates_to', ?, ?, ?, 'conversation', 'ep-reg', '{}')`,
    [id, subj, obj, t, t]
  );
}

describe('searchCaravanBook regression: candidate pool / low-info / edges', () => {
  let db: BetterSqlite3CaravanDb;
  let mockOllama: OllamaClient;

  beforeEach(async () => {
    db = await createTestDb();
    mockOllama = {
      embeddings: jest.fn().mockResolvedValue({ embedding: Float32Array.from([1, 0, 0]) }),
      generate: jest.fn(),
    };
  });

  afterEach(() => {
    db.close();
  });

  test('R1: 挿入順で 200 件を超えた位置にある最新エンティティが見つかる（候補プールの回帰）', async () => {
    const old = '2026-01-01T00:00:00.000Z';
    for (let i = 0; i < 210; i++) {
      insertEntityAt(db, `filler${i}`, `Filler ${i}`, Float32Array.from([0, 1, 0]), old);
    }
    insertEntityAt(db, 'target', 'RecentTarget', Float32Array.from([1, 0, 0]), new Date().toISOString());

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'recent target', limit: 5, hops: 0 },
    });

    expect(result.entities[0]?.id).toBe('target');
    expect(result.entities[0]?.score).toBeCloseTo(1.0, 4);
  });

  test('R2: 低情報エンティティ（不明のバグ等）は結果に含まれない', async () => {
    const t = new Date().toISOString();
    insertEntityAt(db, 'garbage', '不明のバグ', Float32Array.from([1, 0, 0]), t);
    insertEntityAt(db, 'real', 'CaravanApiHandler.ts', Float32Array.from([0.98, 0.2, 0]), t);

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'caravan api', limit: 5, hops: 0 },
    });

    expect(result.entities.some((e) => e.display_name === '不明のバグ')).toBe(false);
    expect(result.entities[0]?.id).toBe('real');
  });

  test('R3: edges は両端の display_name を含み、トップエンティティが object 側の辺も返す', async () => {
    const t = new Date().toISOString();
    insertEntityAt(db, 'ea', 'AlphaEntity', Float32Array.from([1, 0, 0]), t);
    insertEntityAt(db, 'eb', 'BetaEntity', Float32Array.from([0.9, 0.4, 0]), t);
    insertEntityAt(db, 'ec', 'GammaOutside', Float32Array.from([0, 0, 1]), t);
    insertEdge(db, 'edge_ab', 'ea', 'eb');
    insertEdge(db, 'edge_ca', 'ec', 'ea'); // トップ ea が object 側

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'alpha', limit: 2, hops: 1 },
    });

    const ab = result.edges.find((e) => e.id === 'edge_ab');
    expect(ab?.subject_name).toBe('AlphaEntity');
    expect(ab?.object_name).toBe('BetaEntity');
    const ca = result.edges.find((e) => e.id === 'edge_ca');
    expect(ca).toBeDefined();
    expect(ca?.subject_name).toBe('GammaOutside');
  });

  test('R4: edges は上限 100 件で、トップ同士の辺が優先して残る', async () => {
    const t = new Date().toISOString();
    insertEntityAt(db, 'hub', 'HubEntity', Float32Array.from([1, 0, 0]), t);
    insertEntityAt(db, 'peer', 'PeerEntity', Float32Array.from([0.9, 0.4, 0]), t);
    insertEdge(db, 'edge_hub_peer', 'hub', 'peer');
    for (let i = 0; i < 105; i++) {
      insertEntityAt(db, `spoke${i}`, `Spoke ${i}`, Float32Array.from([0, 0, 1]), t);
      insertEdge(db, `edge_spoke${i}`, 'hub', `spoke${i}`);
    }

    const result = await searchCaravanBook({
      db,
      ollama: mockOllama,
      input: { query: 'hub', limit: 2, hops: 1 },
    });

    expect(result.edges.length).toBeLessThanOrEqual(100);
    expect(result.edges.some((e) => e.id === 'edge_hub_peer')).toBe(true);
  });
});
