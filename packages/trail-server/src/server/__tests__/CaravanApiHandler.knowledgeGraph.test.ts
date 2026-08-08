import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { CaravanApiHandler } from '../CaravanApiHandler';

const TS = '2026-08-08T00:00:00.000Z';

function buildKnowledgeGraphDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE caravan_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (type, canonical_name)
  ) STRICT`);
  db.exec(`CREATE TABLE caravan_edges (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object_entity_id TEXT,
    object_literal TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL
  ) STRICT`);
  db.exec(`CREATE TABLE caravan_edge_invalidations (
    id TEXT PRIMARY KEY,
    edge_id TEXT NOT NULL,
    invalidated_at TEXT NOT NULL,
    reason TEXT NOT NULL
  ) STRICT`);

  const entity = db.prepare(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  entity.run('e1', 'Concept', 'trail server', 'TrailDataServer', TS, TS, TS);
  entity.run('e2', 'Concept', 'memory core', 'trail-caravan-book', TS, TS, TS);
  entity.run('e3', 'File', 'server.ts', 'server.ts', TS, TS, TS);
  entity.run('e4', 'Bug', 'fts crash', 'FTS crash', TS, TS, TS);
  entity.run('e5', 'File', 'orphan.ts', 'orphan.ts', TS, TS, TS);

  const edge = db.prepare(
    `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, object_literal, valid_from, valid_to, recorded_at)
     VALUES (?, ?, 'relates_to', ?, ?, ?, ?, ?)`,
  );
  // 有効エッジ: e1-e2 ×2、e1-e3、e1-e4、e2-e3
  edge.run('g1', 'e1', 'e2', null, TS, null, TS);
  edge.run('g2', 'e2', 'e1', null, TS, null, TS);
  edge.run('g3', 'e1', 'e3', null, TS, null, TS);
  edge.run('g4', 'e1', 'e4', null, TS, null, TS);
  edge.run('g5', 'e2', 'e3', null, TS, null, TS);
  // 除外対象: 失効・無効化・リテラル・自己ループ
  edge.run('x1', 'e3', 'e5', null, TS, TS, TS);
  edge.run('x2', 'e4', 'e5', null, TS, null, TS);
  db.prepare(`INSERT INTO caravan_edge_invalidations (id, edge_id, invalidated_at, reason) VALUES ('i1', 'x2', ?, 'manual')`).run(TS);
  edge.run('x3', 'e1', null, 'literal value', TS, null, TS);
  edge.run('x4', 'e2', 'e2', null, TS, null, TS);
  db.close();
}

describe('CaravanApiHandler.getKnowledgeGraph', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: CaravanApiHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-test-'));
    dbPath = path.join(tmpDir, 'caravan-book.db');
    buildKnowledgeGraphDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns degree-ranked nodes with pair-aggregated links and type clusters', async () => {
    const result = await handler.getKnowledgeGraph({});

    expect(result).not.toBeNull();
    // 次数: e1=4, e2=3, e3=2, e4=1（失効 x1・無効化 x2・リテラル x3・自己ループ x4 は数えない）
    expect(result?.nodes).toEqual([
      { label: 'TrailDataServer', type: 'Concept', frequency: 4 },
      { label: 'trail-caravan-book', type: 'Concept', frequency: 3 },
      { label: 'server.ts', type: 'File', frequency: 2 },
      { label: 'FTS crash', type: 'Bug', frequency: 1 },
    ]);
    const sortedLinks = [...(result?.links ?? [])].sort((l, r) => l.a - r.a || l.b - r.b);
    expect(sortedLinks).toEqual([
      { a: 0, b: 1, strength: 2 },
      { a: 0, b: 2, strength: 1 },
      { a: 0, b: 3, strength: 1 },
      { a: 1, b: 2, strength: 1 },
    ]);
    expect(result?.clusters).toEqual([
      { label: 'Concept', members: [0, 1] },
      { label: 'File', members: [2] },
      { label: 'Bug', members: [3] },
    ]);
    expect(result?.totalEntityCount).toBe(5);
    expect(result?.truncated).toBe(false);
    expect(result?.availableTypes).toEqual(['Bug', 'Concept', 'File']);
  });

  it('truncates to the limit and keeps links among the selected nodes only', async () => {
    const result = await handler.getKnowledgeGraph({ limit: 2 });

    expect(result?.nodes.map((n) => n.label)).toEqual(['TrailDataServer', 'trail-caravan-book']);
    expect(result?.links).toEqual([{ a: 0, b: 1, strength: 2 }]);
    expect(result?.truncated).toBe(true);
  });

  it('filters by entity type on both edge endpoints', async () => {
    const result = await handler.getKnowledgeGraph({ types: ['Concept'] });

    // Concept 同士のエッジは e1-e2 ×2 のみ。File との混合エッジは次数に入らない
    expect(result?.nodes).toEqual([
      { label: 'TrailDataServer', type: 'Concept', frequency: 2 },
      { label: 'trail-caravan-book', type: 'Concept', frequency: 2 },
    ]);
    expect(result?.links).toEqual([{ a: 0, b: 1, strength: 2 }]);
    expect(result?.totalEntityCount).toBe(2);
    // 選択肢は全種別のまま（フィルタで選択肢が消えると解除できない）
    expect(result?.availableTypes).toEqual(['Bug', 'Concept', 'File']);
  });

  it('ignores malformed type values instead of interpolating them', async () => {
    const result = await handler.getKnowledgeGraph({ types: ["Concept'; DROP TABLE caravan_entities;--"] });

    // 不正な種別は落ちて「絞り込みなし」になる（有効な種別が 1 つも残らないため）
    expect(result?.nodes.length).toBe(4);
  });

  it('returns null when the db does not exist (distinct from an empty graph)', async () => {
    const missing = new CaravanApiHandler(makeMockLogger(), path.join(tmpDir, 'missing.db'));
    expect(await missing.getKnowledgeGraph({})).toBeNull();
    missing.dispose();
  });
});
