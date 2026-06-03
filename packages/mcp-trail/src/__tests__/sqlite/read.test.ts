import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  getC4ModelDirect,
  listElementsDirect,
  listGroupsDirect,
  listRelationshipsDirect,
  listCommunitiesDirect,
  listCommunityNodesDirect,
} from '../../sqlite/read';

function execInsert(db: Database, sql: string, params: readonly unknown[] = []): void {
  // sql.js 互換のため `db.run(sql, params)` 形式で書かれていたコードを
  // better-sqlite3 ネイティブ API に翻訳する薄い helper。
  db.prepare(sql).run(...(params as unknown[]));
}

// Phase H-2 / H-3: c4_manual_* / current_code_graph(_communities) から repo_name 列を撤去した。
// fixture は実スキーマに合わせ repo_id を持ち、repos に test-repo を seed する。
// read の lookupRepoId が 'test-repo' → REPO_ID を解決する。
const REPO_ID = 1;

/** どの fixture DB にも repos を作り test-repo を seed する (lookupRepoId が repos を引くため)。 */
function seedRepos(db: Database): void {
  db.exec(`
    CREATE TABLE repos (
      repo_id INTEGER PRIMARY KEY,
      repo_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    INSERT INTO repos (repo_id, repo_name, created_at) VALUES (${REPO_ID}, 'test-repo', '2026-01-01T00:00:00.000Z');
  `);
}

function createTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  seedRepos(db);
  db.exec(`
    CREATE TABLE current_code_graphs (
      repo_id INTEGER PRIMARY KEY,
      graph_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE c4_manual_elements (
      repo_id INTEGER NOT NULL,
      element_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      service_type TEXT,
      external INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, element_id)
    );
    CREATE TABLE c4_manual_relationships (
      repo_id INTEGER NOT NULL,
      rel_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      label TEXT,
      technology TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, rel_id)
    );
    CREATE TABLE c4_manual_groups (
      repo_id INTEGER NOT NULL,
      group_id TEXT NOT NULL,
      member_ids TEXT NOT NULL,
      label TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, group_id)
    );
    CREATE TABLE current_code_graph_communities (
      repo_id INTEGER NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      mappings_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, community_id)
    );
  `);
  return db;
}

function createTestDbWithoutMappingsJson(): Database {
  const db = new BetterSqlite3(':memory:');
  seedRepos(db);
  db.exec(`
    CREATE TABLE current_code_graph_communities (
      repo_id INTEGER NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, community_id)
    );
  `);
  return db;
}

/** stable_key も mappings_json もない最古スキーマ（フォールバック2段目のテスト用） */
function createTestDbWithoutStableKey(): Database {
  const db = new BetterSqlite3(':memory:');
  seedRepos(db);
  db.exec(`
    CREATE TABLE current_code_graph_communities (
      repo_id INTEGER NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      mappings_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, community_id)
    );
  `);
  return db;
}

/** stable_key および mappings_json カラムがある最新スキーマ */
function createTestDbWithStableKey(): Database {
  const db = new BetterSqlite3(':memory:');
  seedRepos(db);
  db.exec(`
    CREATE TABLE current_code_graph_communities (
      repo_id INTEGER NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      mappings_json TEXT,
      stable_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_id, community_id)
    );
  `);
  return db;
}

const REPO = 'test-repo';
const NOW = '2026-01-01T00:00:00.000Z';

describe('getC4ModelDirect', () => {
  it('graph_json が無い場合は空の base モデルを返す', () => {
    const db = createTestDb();
    const { model } = getC4ModelDirect(db, REPO);
    expect(model.elements).toEqual([]);
    expect(model.relationships).toEqual([]);
    db.close();
  });

  it('graph_json があれば codeGraphToC4 で派生した C4Model を返す', () => {
    const db = createTestDb();
    const graph = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      repositories: [{ id: 'r1', label: 'TestRepo', path: '/tmp/r1' }],
      nodes: [
        {
          id: 'r1:packages/core/index.ts',
          label: 'index.ts',
          repo: 'r1',
          package: 'core',
          fileType: 'code',
          community: 1,
          communityLabel: 'core-lib',
          x: 0,
          y: 0,
          size: 1,
        },
      ],
      edges: [],
      godNodes: [],
    };
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_id, graph_json, updated_at) VALUES (?, ?, ?)',
      [REPO_ID, JSON.stringify(graph), NOW],
    );
    const { model } = getC4ModelDirect(db, REPO);
    expect(model.elements.find((e) => e.id === 'sys_r1')).toMatchObject({ type: 'system', name: 'TestRepo' });
    expect(model.elements.find((e) => e.id === 'pkg_core')).toMatchObject({ type: 'container' });
    expect(model.elements.find((e) => e.id === 'community_1')).toMatchObject({ type: 'component', name: 'core-lib' });
    expect(model.elements.find((e) => e.id === 'r1:packages/core/index.ts')).toMatchObject({ type: 'code' });
    db.close();
  });

  it('manual elements が mergeManualIntoC4Model 経由でマージされる', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, description, external, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'elem-1', 'system', 'MySystem', 'A system', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'rel-1', 'elem-1', 'elem-2', 'uses', 'HTTP', NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    const elem = model.elements.find((e) => e.id === 'elem-1');
    expect(elem).toBeDefined();
    expect(elem?.name).toBe('MySystem');
    expect(elem?.type).toBe('system');
    db.close();
  });

  it('external フィールドが INTEGER 0/1 → boolean に変換される', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'ext-elem', 'system', 'ExternalSystem', 1, NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    const elem = model.elements.find((e) => e.id === 'ext-elem');
    expect(elem?.external).toBe(true);
    db.close();
  });

  it('description が null の manual element は description を持たない', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, description, external, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'no-desc-elem', 'system', 'NoDesc', null, 0, NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    const elem = model.elements.find((e) => e.id === 'no-desc-elem');
    expect(elem).toBeDefined();
    expect((elem as unknown as Record<string, unknown>).description).toBeUndefined();
    db.close();
  });

  it('service_type がある manual element は serviceType を持つ', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, description, service_type, external, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'svc-elem', 'container', 'MyService', null, 'grpc', 0, NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    const elem = model.elements.find((e) => e.id === 'svc-elem');
    expect(elem).toBeDefined();
    expect((elem as unknown as Record<string, unknown>).serviceType).toBe('grpc');
    db.close();
  });

  it('relationship の label/technology が null の場合は model.relationships に含まれるが label/technology は設定されない', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'src-elem', 'system', 'Src', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'dst-elem', 'system', 'Dst', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'r-no-label', 'src-elem', 'dst-elem', null, null, NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    expect(model.relationships.length).toBeGreaterThan(0);
    const rel = model.relationships.find(
      (r) => (r as unknown as { from: string }).from === 'src-elem',
    );
    expect(rel).toBeDefined();
    expect((rel as unknown as { label?: string }).label).toBeUndefined();
    expect((rel as unknown as { technology?: string }).technology).toBeUndefined();
    db.close();
  });

  it('relationship の label/technology がある場合は model.relationships に含まれ label/technology が設定される', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'from-elem', 'system', 'From', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'to-elem', 'system', 'To', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'r-with-label', 'from-elem', 'to-elem', 'calls', 'HTTP/2', NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    // mergeManualIntoC4Model の結果は relationships 配列に from/to フィールドを持つ（C4Relationship 型）
    expect(model.relationships.length).toBeGreaterThan(0);
    const rel = model.relationships.find(
      (r) => (r as unknown as { from: string }).from === 'from-elem',
    );
    expect(rel).toBeDefined();
    expect((rel as unknown as { label: string }).label).toBe('calls');
    expect((rel as unknown as { technology: string }).technology).toBe('HTTP/2');
    db.close();
  });
});

describe('listElementsDirect', () => {
  it('要素の id / type / name を配列で返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'e1', 'container', 'ServiceA', 0, NOW],
    );

    const elements = listElementsDirect(db, REPO);
    expect(elements.length).toBeGreaterThan(0);
    const e = elements.find((el) => el.id === 'e1');
    expect(e?.type).toBe('container');
    expect(e?.name).toBe('ServiceA');
    db.close();
  });

  it('external = true の要素は external フィールドを持つ', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'ext-1', 'system', 'ExternalSys', 1, NOW],
    );

    const elements = listElementsDirect(db, REPO);
    const e = elements.find((el) => el.id === 'ext-1');
    expect(e?.external).toBe(true);
    db.close();
  });

  it('external = false の要素は external フィールドを持たない', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'int-1', 'container', 'Internal', 0, NOW],
    );

    const elements = listElementsDirect(db, REPO);
    const e = elements.find((el) => el.id === 'int-1');
    expect(e?.external).toBeUndefined();
    db.close();
  });

  it('manual フラグが付いた要素は manual: true を持つ（graph 由来の manual 要素）', () => {
    const db = createTestDb();
    const graph = {
      generatedAt: NOW,
      repositories: [{ id: 'r1', label: 'TestRepo', path: '/tmp/r1' }],
      nodes: [
        {
          id: 'r1:packages/core/index.ts',
          label: 'index.ts',
          repo: 'r1',
          package: 'core',
          fileType: 'code',
          community: 1,
          communityLabel: 'core-lib',
          x: 0,
          y: 0,
          size: 1,
        },
      ],
      edges: [],
      godNodes: [],
    };
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_id, graph_json, updated_at) VALUES (?, ?, ?)',
      [REPO_ID, JSON.stringify(graph), NOW],
    );
    // manual 要素を追加（mergeManualIntoC4Model が manual:true を付ける）
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_id, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'man-elem', 'system', 'ManualSystem', 0, NOW],
    );

    const elements = listElementsDirect(db, REPO);
    const manElem = elements.find((el) => el.id === 'man-elem');
    // manual 要素は mergeManualIntoC4Model によって manual: true が設定される
    expect(manElem?.manual).toBe(true);
    db.close();
  });
});

describe('listGroupsDirect', () => {
  it('グループを返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_groups (repo_id, group_id, member_ids, label, updated_at) VALUES (?, ?, ?, ?, ?)',
      [REPO_ID, 'grp-1', JSON.stringify(['e1', 'e2']), 'Group A', NOW],
    );

    const groups = listGroupsDirect(db, REPO);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('grp-1');
    expect(groups[0].memberIds).toEqual(['e1', 'e2']);
    expect(groups[0].label).toBe('Group A');
    db.close();
  });

  it('label が null のときは省略される', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_groups (repo_id, group_id, member_ids, label, updated_at) VALUES (?, ?, ?, ?, ?)',
      [REPO_ID, 'grp-2', JSON.stringify(['e3']), null, NOW],
    );

    const groups = listGroupsDirect(db, REPO);
    expect(groups[0].label).toBeUndefined();
    db.close();
  });
});

describe('listRelationshipsDirect', () => {
  it('リレーションシップを返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'rel-1', 'a', 'b', 'calls', 'gRPC', NOW],
    );

    const rels = listRelationshipsDirect(db, REPO);
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe('rel-1');
    expect(rels[0].fromId).toBe('a');
    expect(rels[0].toId).toBe('b');
    expect(rels[0].label).toBe('calls');
    expect(rels[0].technology).toBe('gRPC');
    db.close();
  });

  it('label / technology が null のときは省略される', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_id, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 'rel-2', 'c', 'd', null, null, NOW],
    );

    const rels = listRelationshipsDirect(db, REPO);
    expect(rels[0].label).toBeUndefined();
    expect(rels[0].technology).toBeUndefined();
    db.close();
  });
});

describe('listCommunitiesDirect', () => {
  it('mappings_json カラムありの場合にコミュニティを返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, mappings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 1, 'auth', 'Auth Module', 'Handles authentication', '{"elements":[]}', NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].communityId).toBe(1);
    expect(communities[0].label).toBe('auth');
    expect(communities[0].name).toBe('Auth Module');
    expect(communities[0].summary).toBe('Handles authentication');
    expect(communities[0].mappingsJson).toBe('{"elements":[]}');
    db.close();
  });

  it('mappings_json が null の行は mappingsJson: null を返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, mappings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 2, 'core', 'Core Module', 'Core logic', null, NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities[0].mappingsJson).toBeNull();
    db.close();
  });

  it('mappings_json カラムなしの場合は mappingsJson: null でフォールバックする', () => {
    const db = createTestDbWithoutMappingsJson();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO_ID, 1, 'infra', 'Infrastructure', 'Infra services', NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].communityId).toBe(1);
    expect(communities[0].mappingsJson).toBeNull();
    db.close();
  });

  it('データなしの場合は空配列を返す', () => {
    const db = createTestDb();
    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities).toEqual([]);
    db.close();
  });

  it('stable_key カラムがある場合は stableKey に値が入る', () => {
    const db = createTestDbWithStableKey();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, mappings_json, stable_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 1, 'auth', 'Auth Module', 'Auth logic', '{}', 'sk_abc123', NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].stableKey).toBe('sk_abc123');
    expect(communities[0].mappingsJson).toBe('{}');
    db.close();
  });

  it('stable_key カラムなし・mappings_json あり の場合は stableKey が空文字でフォールバックする', () => {
    const db = createTestDbWithoutStableKey();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_id, community_id, label, name, summary, mappings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO_ID, 1, 'core', 'Core Module', 'Core logic', '{"elements":[]}', NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].communityId).toBe(1);
    expect(communities[0].mappingsJson).toBe('{"elements":[]}');
    expect(communities[0].stableKey).toBe('');
    db.close();
  });
});

describe('listCommunityNodesDirect', () => {
  function insertGraph(db: Database, repoName: string, nodes: Array<Partial<{ id: string; label: string; package: string; community: number }>>): void {
    const graph = {
      generatedAt: NOW,
      repositories: [{ id: 'r1', label: 'TestRepo', path: '/tmp/r1' }],
      nodes: nodes.map((n) => ({
        id: n.id ?? 'unknown',
        label: n.label ?? 'unknown',
        repo: 'r1',
        package: n.package ?? '',
        fileType: 'code',
        community: n.community ?? 0,
        communityLabel: '',
        x: 0,
        y: 0,
        size: 1,
      })),
      edges: [],
      godNodes: [],
    };
    // Phase H-3: current_code_graphs は repo_id PK。repoName を repos へ upsert して repo_id を引く
    // (trail-db / mcp-trail の resolveRepoId 相当・別 repo は別 repo_id になる)。
    db.prepare(
      "INSERT INTO repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z') ON CONFLICT(repo_name) DO NOTHING",
    ).run(repoName);
    const repoId = (db.prepare('SELECT repo_id FROM repos WHERE repo_name = ?').get(repoName) as { repo_id: number }).repo_id;
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_id, graph_json, updated_at) VALUES (?, ?, ?)',
      [repoId, JSON.stringify(graph), NOW],
    );
  }

  it('current_code_graphs に行がない場合は空配列を返す', () => {
    const db = createTestDb();
    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities).toEqual([]);
    db.close();
  });

  it('複数コミュニティを communityId 昇順・nodes id 昇順でグループ化する', () => {
    const db = createTestDb();
    insertGraph(db, REPO, [
      { id: 'trail-core/src/coverage/zNode', label: 'zNode', package: 'trail-core', community: 5 },
      { id: 'trail-core/src/coverage/aggregateCoverage', label: 'aggregateCoverage', package: 'trail-core', community: 5 },
      { id: 'trail-viewer/src/hooks/useCoverage', label: 'useCoverage', package: 'trail-viewer', community: 3 },
      { id: 'trail-viewer/src/hooks/useDiff', label: 'useDiff', package: 'trail-viewer', community: 3 },
      { id: 'markdown-core/src/parse', label: 'parse', package: 'markdown-core', community: 1 },
    ]);

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities.map((c) => c.communityId)).toEqual([1, 3, 5]);
    const c5 = communities.find((c) => c.communityId === 5)!;
    expect(c5.nodes.map((n) => n.id)).toEqual([
      'trail-core/src/coverage/aggregateCoverage',
      'trail-core/src/coverage/zNode',
    ]);
    expect(c5.nodes[0]).toEqual({
      id: 'trail-core/src/coverage/aggregateCoverage',
      label: 'aggregateCoverage',
      package: 'trail-core',
    });
    db.close();
  });

  it('単一コミュニティのみの場合も配列で返す', () => {
    const db = createTestDb();
    insertGraph(db, REPO, [
      { id: 'a', label: 'a', package: 'pkg', community: 0 },
      { id: 'b', label: 'b', package: 'pkg', community: 0 },
    ]);

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].communityId).toBe(0);
    expect(communities[0].nodes).toHaveLength(2);
    db.close();
  });

  it('package が欠落しているノードは空文字でフォールバックする', () => {
    const db = createTestDb();
    // package を明示的に空にして古いスキーマを模擬
    insertGraph(db, REPO, [
      { id: 'legacy-node', label: 'legacy', community: 7 },
    ]);

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities[0].nodes[0].package).toBe('');
    db.close();
  });

  it('graph_json に nodes フィールドがない場合は空コミュニティ配列を返す', () => {
    const db = createTestDb();
    // nodes フィールドを省いたグラフ JSON（graph.nodes = undefined → nodes ?? [] → []）
    const graphWithoutNodes = JSON.stringify({
      generatedAt: NOW,
      repositories: [{ id: 'r1', label: 'Repo', path: '/tmp' }],
      // nodes: は省略
      edges: [],
      godNodes: [],
    });
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_id, graph_json, updated_at) VALUES (?, ?, ?)',
      [REPO_ID, graphWithoutNodes, NOW],
    );

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities).toEqual([]);
    db.close();
  });

  it('ノードに package フィールドがない場合は空文字でフォールバックする（直接 JSON で検証）', () => {
    const db = createTestDb();
    // package フィールドを省いたノードを含むグラフ JSON（n.package = undefined → n.package ?? '' → ''）
    const graphWithoutPackage = JSON.stringify({
      generatedAt: NOW,
      repositories: [{ id: 'r1', label: 'Repo', path: '/tmp' }],
      nodes: [
        {
          id: 'no-pkg-node',
          label: 'noPkg',
          repo: 'r1',
          // package: は省略
          fileType: 'code',
          community: 2,
          communityLabel: '',
          x: 0,
          y: 0,
          size: 1,
        },
      ],
      edges: [],
      godNodes: [],
    });
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_id, graph_json, updated_at) VALUES (?, ?, ?)',
      [REPO_ID, graphWithoutPackage, NOW],
    );

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].nodes[0].package).toBe('');
    db.close();
  });

  it('別 repo のグラフは混じらない', () => {
    const db = createTestDb();
    insertGraph(db, REPO, [{ id: 'x', label: 'x', package: 'p', community: 1 }]);
    insertGraph(db, 'other-repo', [{ id: 'y', label: 'y', package: 'p', community: 9 }]);

    const { communities } = listCommunityNodesDirect(db, REPO);
    expect(communities).toHaveLength(1);
    expect(communities[0].communityId).toBe(1);
    expect(communities[0].nodes[0].id).toBe('x');
    db.close();
  });
});
