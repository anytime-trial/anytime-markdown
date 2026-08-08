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
    valid_until TEXT,
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
  // soft delete 済み（ソースから消えたファイル）。辺は残っているが図には出さない
  db.prepare(
    `INSERT INTO caravan_entities (id, type, canonical_name, display_name, valid_until, first_seen_at, last_updated_at, recorded_at)
     VALUES ('e6', 'File', 'deleted.ts', 'deleted.ts', ?, ?, ?, ?)`,
  ).run(TS, TS, TS, TS);

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
  // soft delete 済みエンティティを端点に持つ辺（辺自体は失効していない）
  edge.run('x5', 'e1', 'e6', null, TS, null, TS);
  db.close();
}

/**
 * ハブ&スポーク構造。ハブ 2 件（h1 / h2）はそれぞれ次数 3 のスポークを持つが、
 * ハブ同士は繋がっていない。次数上位 N でノードを選ぶとハブだけが残り、
 * リンクが 1 本も引けない「孤立ノードだけの図」になる。
 */
function buildHubAndSpokeDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE caravan_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    valid_until TEXT,
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
  const edge = db.prepare(
    `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, object_literal, valid_from, valid_to, recorded_at)
     VALUES (?, ?, 'relates_to', ?, NULL, ?, NULL, ?)`,
  );
  for (const hub of ['h1', 'h2']) {
    entity.run(hub, 'Package', hub, hub, TS, TS, TS);
    for (let i = 0; i < 3; i += 1) {
      const spoke = `${hub}s${i}`;
      entity.run(spoke, 'File', spoke, spoke, TS, TS, TS);
      edge.run(`e-${spoke}`, hub, spoke, TS, TS);
    }
  }
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
    // 次数: e1=4, e2=3, e3=2, e4=1
    // （失効 x1・無効化 x2・リテラル x3・自己ループ x4・soft delete 端点 x5 は数えない）
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
    expect(result?.totalEntityCount).toBe(6);
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

  it('falls back to the top-degree node when the limit cannot fit a single pair', async () => {
    const result = await handler.getKnowledgeGraph({ limit: 1 });

    expect(result?.nodes.map((n) => n.label)).toEqual(['TrailDataServer']);
    expect(result?.links).toEqual([]);
    expect(result?.truncated).toBe(true);
  });

  it('returns null when the db does not exist (distinct from an empty graph)', async () => {
    const missing = new CaravanApiHandler(makeMockLogger(), path.join(tmpDir, 'missing.db'));
    expect(await missing.getKnowledgeGraph({})).toBeNull();
    missing.dispose();
  });
});

describe('CaravanApiHandler.getKnowledgeGraph — hub and spoke', () => {
  let tmpDir: string;
  let handler: CaravanApiHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-hub-test-'));
    const dbPath = path.join(tmpDir, 'caravan-book.db');
    buildHubAndSpokeDb(dbPath);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('never returns a node without a link (hubs alone would be isolated)', async () => {
    // 次数上位 2 件はハブ h1 / h2 だが両者は繋がっていない。旧選定では links が空になる。
    const result = await handler.getKnowledgeGraph({ limit: 2 });

    expect(result?.nodes).toHaveLength(2);
    expect(result?.links.length).toBeGreaterThan(0);
    const linkedIndices = new Set(result?.links.flatMap((l) => [l.a, l.b]));
    expect([...linkedIndices].sort()).toEqual([0, 1]);
    // ハブ 1 件 + そのスポーク 1 件が選ばれる（ハブ 2 件ではない）
    expect(result?.nodes.map((n) => n.type)).toEqual(['Package', 'File']);
    expect(result?.truncated).toBe(true);
  });

  it('leaves a slot unfilled rather than adding a node that would be isolated', async () => {
    const result = await handler.getKnowledgeGraph({ limit: 5 });

    // h1 + スポーク 3 件で 4 枠。残り 1 枠に h2 を入れると相手が居ないので入れない
    expect(result?.nodes.map((n) => n.label)).toEqual(['h1', 'h1s0', 'h1s1', 'h1s2']);
    const linkedIndices = new Set(result?.links.flatMap((l) => [l.a, l.b]));
    expect(linkedIndices.size).toBe(result?.nodes.length);
  });

  it('builds the link query for a large node set (選定 ID を JSON 1 バインドで渡す)', async () => {
    // 選定 ID をバインド 1 個（json_each）で渡す形が壊れていないことを見る。
    // `IN (?,…)` で並べるとバインド数がノード数に比例し、SQLite の変数上限
    // （32,766）がそのままノード数上限になる。
    const dbPath = path.join(tmpDir, 'chain.db');
    const chain = new BetterSqlite3(dbPath);
    chain.exec(`CREATE TABLE caravan_entities (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, canonical_name TEXT NOT NULL,
      display_name TEXT NOT NULL, valid_until TEXT, first_seen_at TEXT NOT NULL,
      last_updated_at TEXT NOT NULL, recorded_at TEXT NOT NULL, UNIQUE (type, canonical_name)) STRICT`);
    chain.exec(`CREATE TABLE caravan_edges (
      id TEXT PRIMARY KEY, subject_entity_id TEXT NOT NULL, predicate TEXT NOT NULL,
      object_entity_id TEXT, object_literal TEXT, valid_from TEXT NOT NULL,
      valid_to TEXT, recorded_at TEXT NOT NULL) STRICT`);
    chain.exec(`CREATE TABLE caravan_edge_invalidations (
      id TEXT PRIMARY KEY, edge_id TEXT NOT NULL, invalidated_at TEXT NOT NULL, reason TEXT NOT NULL) STRICT`);
    const ent = chain.prepare(
      `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, ?, ?, ?)`,
    );
    const lnk = chain.prepare(
      `INSERT INTO caravan_edges (id, subject_entity_id, predicate, object_entity_id, object_literal, valid_from, valid_to, recorded_at)
       VALUES (?, ?, 'relates_to', ?, NULL, ?, NULL, ?)`,
    );
    const SIZE = 400;
    const pad = (i: number): string => `n${String(i).padStart(4, '0')}`;
    // 1 行ずつ commit すると fsync が 800 回走ってテストが 10 秒級になる
    chain.transaction(() => {
      for (let i = 0; i < SIZE; i += 1) ent.run(pad(i), pad(i), pad(i), TS, TS, TS);
      for (let i = 0; i + 1 < SIZE; i += 1) lnk.run(`l${i}`, pad(i), pad(i + 1), TS, TS);
    })();
    chain.close();

    const chainHandler = new CaravanApiHandler(makeMockLogger(), dbPath);
    try {
      const result = await chainHandler.getKnowledgeGraph({ limit: SIZE });
      expect(result?.nodes).toHaveLength(SIZE);
      expect(result?.links).toHaveLength(SIZE - 1);
      const linked = new Set(result?.links.flatMap((l) => [l.a, l.b]));
      expect(linked.size).toBe(SIZE);
    } finally {
      chainHandler.dispose();
    }
  }, 30000);

  it('reports frequency as the global degree, not the degree inside the returned subgraph', async () => {
    const result = await handler.getKnowledgeGraph({ limit: 2 });

    // ハブの次数はスポーク 3 本ぶん。返却部分グラフ内の 1 本ではない
    expect(result?.nodes[0]?.frequency).toBe(3);
  });
});

describe('CaravanApiHandler.getKnowledgeGraph — server-side layout', () => {
  let tmpDir: string;
  let handler: CaravanApiHandler;
  let dbPath: string;

  function addLayoutTable(withRows: boolean): void {
    const db = new BetterSqlite3(dbPath);
    db.exec(`CREATE TABLE caravan_entity_layout (
      entity_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL,
      community_id INTEGER NOT NULL, graph_version TEXT NOT NULL, recorded_at TEXT NOT NULL) STRICT`);
    if (withRows) {
      const ins = db.prepare(
        `INSERT INTO caravan_entity_layout (entity_id, x, y, community_id, graph_version, recorded_at)
         VALUES (?, ?, ?, 0, 'v1', ?)`,
      );
      ins.run('e1', 10.5, -20.5, TS);
      ins.run('e2', 30, 40, TS);
      ins.run('e3', -5, 5, TS);
      ins.run('e4', 1, 2, TS);
    }
    db.close();
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-layout-api-'));
    dbPath = path.join(tmpDir, 'caravan-book.db');
    buildKnowledgeGraphDb(dbPath);
  });

  afterEach(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns stored coordinates for every node', async () => {
    addLayoutTable(true);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({});

    expect(result?.nodes.map((n) => [n.x, n.y])).toEqual([
      [10.5, -20.5], [30, 40], [-5, 5], [1, 2],
    ]);
  });

  it('omits coordinates for nodes the layout has not covered yet', async () => {
    addLayoutTable(false);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({});

    expect(result?.nodes.length).toBeGreaterThan(0);
    for (const node of result?.nodes ?? []) {
      expect(node.x).toBeUndefined();
      expect(node.y).toBeUndefined();
    }
  });

  it('works against a database without the layout table (migration 026 未適用)', async () => {
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({});

    expect(result?.nodes.length).toBe(4);
    expect(result?.nodes[0]?.x).toBeUndefined();
  });

  it('reports bboxApplied=false when no viewport was requested', async () => {
    addLayoutTable(true);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({});

    expect(result?.bboxApplied).toBe(false);
  });

  it('selects only the nodes whose stored coordinates fall inside the viewport', async () => {
    // 座標: e1(10.5,-20.5) / e2(30,40) / e3(-5,5) / e4(1,2)。視野は e2 だけを外す
    addLayoutTable(true);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({
      bbox: { minX: -10, minY: -30, maxX: 20, maxY: 10 },
    });

    expect(result?.bboxApplied).toBe(true);
    // 両端が視野に入るエッジは e1-e3 / e1-e4 のみ（e1-e2 は相手が画面外）
    expect(result?.nodes.map((n) => n.label).sort()).toEqual(['FTS crash', 'TrailDataServer', 'server.ts']);
    expect(result?.nodes.find((n) => n.label === 'TrailDataServer')?.frequency).toBe(2);
    expect(result?.links).toHaveLength(2);
  });

  it('drops links whose far endpoint is outside the viewport', async () => {
    // e2 側だけを含む視野。e1-e2 は片端が外なので、e2 は繋がる相手を失って選ばれない
    addLayoutTable(true);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({
      bbox: { minX: 25, minY: 35, maxX: 35, maxY: 45 },
    });

    expect(result?.bboxApplied).toBe(true);
    expect(result?.nodes).toEqual([]);
    expect(result?.links).toEqual([]);
    // 「絞った結果 0 件」であって「視野を無視した」ではないことが応答から分かる
    expect(result?.truncated).toBe(false);
  });

  it('keeps the whole-graph denominator while the viewport narrows the result', async () => {
    addLayoutTable(true);
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({
      bbox: { minX: -10, minY: -30, maxX: 20, maxY: 10 },
    });

    // totalEntityCount は DB 全体のまま（視野は分子だけを絞る）
    expect(result?.totalEntityCount).toBe(6);
    expect(result?.availableTypes).toEqual(['Bug', 'Concept', 'File']);
  });

  it('ignores the viewport when the layout table is absent instead of returning an empty graph', async () => {
    handler = new CaravanApiHandler(makeMockLogger(), dbPath);
    const result = await handler.getKnowledgeGraph({
      bbox: { minX: -10, minY: -30, maxX: 20, maxY: 10 },
    });

    expect(result?.bboxApplied).toBe(false);
    expect(result?.nodes.length).toBe(4);
  });
});
