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

function createTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE current_code_graphs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      graph_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE c4_manual_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      element_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      service_type TEXT,
      external INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE c4_manual_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      rel_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      label TEXT,
      technology TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE c4_manual_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      group_id TEXT NOT NULL,
      member_ids TEXT NOT NULL,
      label TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE current_code_graph_communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      mappings_json TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function createTestDbWithoutMappingsJson(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE current_code_graph_communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      community_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      'INSERT INTO current_code_graphs (repo_name, graph_json, updated_at) VALUES (?, ?, ?)',
      [REPO, JSON.stringify(graph), NOW],
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
      'INSERT INTO c4_manual_elements (repo_name, element_id, type, name, description, external, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 'elem-1', 'system', 'MySystem', 'A system', 0, NOW],
    );
    execInsert(
      db,
      'INSERT INTO c4_manual_relationships (repo_name, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 'rel-1', 'elem-1', 'elem-2', 'uses', 'HTTP', NOW],
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
      'INSERT INTO c4_manual_elements (repo_name, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO, 'ext-elem', 'system', 'ExternalSystem', 1, NOW],
    );

    const { model } = getC4ModelDirect(db, REPO);
    const elem = model.elements.find((e) => e.id === 'ext-elem');
    expect(elem?.external).toBe(true);
    db.close();
  });
});

describe('listElementsDirect', () => {
  it('要素の id / type / name を配列で返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_elements (repo_name, element_id, type, name, external, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO, 'e1', 'container', 'ServiceA', 0, NOW],
    );

    const elements = listElementsDirect(db, REPO);
    expect(elements.length).toBeGreaterThan(0);
    const e = elements.find((el) => el.id === 'e1');
    expect(e?.type).toBe('container');
    expect(e?.name).toBe('ServiceA');
    db.close();
  });
});

describe('listGroupsDirect', () => {
  it('グループを返す', () => {
    const db = createTestDb();
    execInsert(
      db,
      'INSERT INTO c4_manual_groups (repo_name, group_id, member_ids, label, updated_at) VALUES (?, ?, ?, ?, ?)',
      [REPO, 'grp-1', JSON.stringify(['e1', 'e2']), 'Group A', NOW],
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
      'INSERT INTO c4_manual_groups (repo_name, group_id, member_ids, label, updated_at) VALUES (?, ?, ?, ?, ?)',
      [REPO, 'grp-2', JSON.stringify(['e3']), null, NOW],
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
      'INSERT INTO c4_manual_relationships (repo_name, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 'rel-1', 'a', 'b', 'calls', 'gRPC', NOW],
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
      'INSERT INTO c4_manual_relationships (repo_name, rel_id, from_id, to_id, label, technology, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 'rel-2', 'c', 'd', null, null, NOW],
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
      'INSERT INTO current_code_graph_communities (repo_name, community_id, label, name, summary, mappings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 1, 'auth', 'Auth Module', 'Handles authentication', '{"elements":[]}', NOW],
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
      'INSERT INTO current_code_graph_communities (repo_name, community_id, label, name, summary, mappings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [REPO, 2, 'core', 'Core Module', 'Core logic', null, NOW],
    );

    const { communities } = listCommunitiesDirect(db, REPO);
    expect(communities[0].mappingsJson).toBeNull();
    db.close();
  });

  it('mappings_json カラムなしの場合は mappingsJson: null でフォールバックする', () => {
    const db = createTestDbWithoutMappingsJson();
    execInsert(
      db,
      'INSERT INTO current_code_graph_communities (repo_name, community_id, label, name, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [REPO, 1, 'infra', 'Infrastructure', 'Infra services', NOW],
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
    execInsert(
      db,
      'INSERT INTO current_code_graphs (repo_name, graph_json, updated_at) VALUES (?, ?, ?)',
      [repoName, JSON.stringify(graph), NOW],
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
