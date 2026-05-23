import BetterSqlite3, { type Database } from 'better-sqlite3';
import { get, all } from '../../sqlite/sqlJsUtil';
import {
  upsertCommunitySummariesDirect,
  upsertCommunityMappingsDirect,
  addElementDirect,
  updateElementDirect,
  removeElementDirect,
  addGroupDirect,
  updateGroupDirect,
  removeGroupDirect,
  addRelationshipDirect,
  removeRelationshipDirect,
} from '../../sqlite/write';

function createTestDb(includeMappingsJson = false): Database {
  const db = new BetterSqlite3(':memory:');
  const communitySchema = includeMappingsJson
    ? `CREATE TABLE current_code_graph_communities (
        repo_name TEXT NOT NULL,
        community_id INTEGER NOT NULL,
        label TEXT,
        name TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        mappings_json TEXT,
        generated_at TEXT,
        updated_at TEXT,
        PRIMARY KEY (repo_name, community_id)
      );`
    : `CREATE TABLE current_code_graph_communities (
        repo_name TEXT NOT NULL,
        community_id INTEGER NOT NULL,
        label TEXT,
        name TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        generated_at TEXT,
        updated_at TEXT,
        PRIMARY KEY (repo_name, community_id)
      );`;

  db.exec(`
    ${communitySchema}
    CREATE TABLE repos (
      repo_id INTEGER PRIMARY KEY,
      repo_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE c4_manual_elements (
      repo_id INTEGER NOT NULL,
      element_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      external INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT,
      service_type TEXT,
      updated_at TEXT,
      PRIMARY KEY (repo_id, element_id)
    );
    CREATE TABLE c4_manual_relationships (
      repo_id INTEGER NOT NULL,
      rel_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      label TEXT,
      technology TEXT,
      updated_at TEXT,
      PRIMARY KEY (repo_id, rel_id)
    );
    CREATE TABLE c4_manual_groups (
      repo_id INTEGER NOT NULL,
      group_id TEXT NOT NULL,
      member_ids TEXT NOT NULL DEFAULT '[]',
      label TEXT,
      updated_at TEXT,
      PRIMARY KEY (repo_id, group_id)
    );
  `);
  return db;
}

const REPO = 'test-repo';

describe('upsertCommunitySummariesDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('INSERT 新規行', () => {
    const result = upsertCommunitySummariesDirect(db, REPO, [
      { communityId: 1, name: 'Comm A', summary: 'Summary A' },
    ]);
    expect(result.updated).toBe(0);
    const row = get<{ name: string; summary: string }>(
      db,
      'SELECT name, summary FROM current_code_graph_communities WHERE repo_name=? AND community_id=?',
      [REPO, 1],
    );
    expect(row).toBeDefined();
    expect(row!.name).toBe('Comm A');
    expect(row!.summary).toBe('Summary A');
  });

  test('2 回目 upsert で UPDATE、updated カウント正確', () => {
    upsertCommunitySummariesDirect(db, REPO, [{ communityId: 1, name: 'Old', summary: 'Old summary' }]);
    const result = upsertCommunitySummariesDirect(db, REPO, [{ communityId: 1, name: 'New', summary: 'New summary' }]);
    expect(result.updated).toBe(1);
    const row = get<{ name: string; summary: string }>(
      db,
      'SELECT name, summary FROM current_code_graph_communities WHERE repo_name=? AND community_id=?',
      [REPO, 1],
    );
    expect(row!.name).toBe('New');
    expect(row!.summary).toBe('New summary');
  });
});

describe('upsertCommunityMappingsDirect', () => {
  test('mappings_json カラムがなければ ALTER で追加される', () => {
    const db = createTestDb(false);
    const colsBefore = all<{ name: string }>(db, 'PRAGMA table_info(current_code_graph_communities)');
    expect(colsBefore.some((c) => c.name === 'mappings_json')).toBe(false);

    upsertCommunityMappingsDirect(db, REPO, [
      { communityId: 1, mappings: [{ elementId: 'e1', elementType: 'Container', role: 'primary' }] },
    ]);

    const colsAfter = all<{ name: string }>(db, 'PRAGMA table_info(current_code_graph_communities)');
    expect(colsAfter.some((c) => c.name === 'mappings_json')).toBe(true);
    db.close();
  });

  test('mappings が JSON で保存される', () => {
    const db = createTestDb(true);
    const mappings = [{ elementId: 'e1', elementType: 'Container', role: 'primary' as const }];
    upsertCommunityMappingsDirect(db, REPO, [{ communityId: 1, mappings }]);
    const row = get<{ mappings_json: string }>(
      db,
      'SELECT mappings_json FROM current_code_graph_communities WHERE repo_name=? AND community_id=?',
      [REPO, 1],
    );
    expect(row).toBeDefined();
    expect(JSON.parse(row!.mappings_json)).toEqual(mappings);
    db.close();
  });

  test('updated / inserted 集計正確', () => {
    const db = createTestDb(true);
    const r1 = upsertCommunityMappingsDirect(db, REPO, [
      { communityId: 1, mappings: [] },
      { communityId: 2, mappings: [] },
    ]);
    expect(r1.inserted).toBe(2);
    expect(r1.updated).toBe(0);

    const r2 = upsertCommunityMappingsDirect(db, REPO, [
      { communityId: 1, mappings: [] },
      { communityId: 3, mappings: [] },
    ]);
    expect(r2.updated).toBe(1);
    expect(r2.inserted).toBe(1);
    db.close();
  });
});

describe('addElementDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('id が man_ 始まりで生成される', () => {
    const result = addElementDirect(db, REPO, { type: 'Container', name: 'API', external: false, parentId: null });
    expect(result.id).toMatch(/^man_/);
  });

  test('SELECT で取得できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'API', external: false, parentId: null, description: 'desc', serviceType: 'web' });
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoIdRow = get<{ repo_id: number }>(db, 'SELECT repo_id FROM repos WHERE repo_name=?', [REPO]);
    const row = get<Record<string, unknown>>(db, 'SELECT * FROM c4_manual_elements WHERE repo_id=? AND element_id=?', [repoIdRow!.repo_id, id]);
    expect(row).toBeDefined();
    expect(row!.name).toBe('API');
    expect(row!.type).toBe('Container');
    expect(row!.description).toBe('desc');
    expect(row!.service_type).toBe('web');
  });

  test('external true -> 1, false -> 0', () => {
    const { id: id1 } = addElementDirect(db, REPO, { type: 'Container', name: 'Ext', external: true, parentId: null });
    const { id: id2 } = addElementDirect(db, REPO, { type: 'Container', name: 'Int', external: false, parentId: null });
    const r1 = get<{ external: number }>(db, 'SELECT external FROM c4_manual_elements WHERE element_id=?', [id1]);
    const r2 = get<{ external: number }>(db, 'SELECT external FROM c4_manual_elements WHERE element_id=?', [id2]);
    expect(r1!.external).toBe(1);
    expect(r2!.external).toBe(0);
  });
});

describe('updateElementDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('name のみ更新（description は変わらない）', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'Old', external: false, parentId: null, description: 'Desc' });
    updateElementDirect(db, REPO, id, { name: 'New' });
    const row = get<{ name: string; description: string }>(db, 'SELECT name, description FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.name).toBe('New');
    expect(row!.description).toBe('Desc');
  });

  test('changes 空 -> no-op', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'Same', external: false, parentId: null });
    updateElementDirect(db, REPO, id, {});
    const row = get<{ name: string }>(db, 'SELECT name FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.name).toBe('Same');
  });

  test('description を更新できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'E', external: false, parentId: null, description: 'old desc' });
    updateElementDirect(db, REPO, id, { description: 'new desc' });
    const row = get<{ description: string }>(db, 'SELECT description FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.description).toBe('new desc');
  });

  test('external を true → false に更新できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'E', external: true, parentId: null });
    updateElementDirect(db, REPO, id, { external: false });
    const row = get<{ external: number }>(db, 'SELECT external FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.external).toBe(0);
  });

  test('external を false → true に更新できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'E', external: false, parentId: null });
    updateElementDirect(db, REPO, id, { external: true });
    const row = get<{ external: number }>(db, 'SELECT external FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.external).toBe(1);
  });

  test('serviceType を更新できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'E', external: false, parentId: null, serviceType: 'web' });
    updateElementDirect(db, REPO, id, { serviceType: 'grpc' });
    const row = get<{ service_type: string }>(db, 'SELECT service_type FROM c4_manual_elements WHERE element_id=?', [id]);
    expect(row!.service_type).toBe('grpc');
  });

  test('複数フィールドを同時に更新できる', () => {
    const { id } = addElementDirect(db, REPO, { type: 'Container', name: 'E', external: false, parentId: null, description: 'old', serviceType: 'http' });
    updateElementDirect(db, REPO, id, { name: 'Updated', description: 'new desc', external: true, serviceType: 'grpc' });
    const row = get<{ name: string; description: string; external: number; service_type: string }>(
      db,
      'SELECT name, description, external, service_type FROM c4_manual_elements WHERE element_id=?',
      [id],
    );
    expect(row!.name).toBe('Updated');
    expect(row!.description).toBe('new desc');
    expect(row!.external).toBe(1);
    expect(row!.service_type).toBe('grpc');
  });
});

describe('removeElementDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('関連 relationship も削除される', () => {
    const { id: fromId } = addElementDirect(db, REPO, { type: 'Container', name: 'From', external: false, parentId: null });
    const { id: toId } = addElementDirect(db, REPO, { type: 'Container', name: 'To', external: false, parentId: null });
    const { id: relId } = addRelationshipDirect(db, REPO, { fromId, toId });

    removeElementDirect(db, REPO, fromId);

    const el = get(db, 'SELECT * FROM c4_manual_elements WHERE element_id=?', [fromId]);
    expect(el).toBeUndefined();
    const rel = get(db, 'SELECT * FROM c4_manual_relationships WHERE rel_id=?', [relId]);
    expect(rel).toBeUndefined();
  });
});

describe('addGroupDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('group_id が grp_ 始まり', () => {
    const result = addGroupDirect(db, REPO, { memberIds: ['e1', 'e2'] });
    expect(result.id).toMatch(/^grp_/);
  });

  test('member_ids が JSON で保存される', () => {
    const { id } = addGroupDirect(db, REPO, { memberIds: ['e1', 'e2'], label: 'G1' });
    const row = get<{ member_ids: string; label: string }>(db, 'SELECT member_ids, label FROM c4_manual_groups WHERE group_id=?', [id]);
    expect(JSON.parse(row!.member_ids)).toEqual(['e1', 'e2']);
    expect(row!.label).toBe('G1');
  });
});

describe('updateGroupDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('memberIds 更新', () => {
    const { id } = addGroupDirect(db, REPO, { memberIds: ['e1'] });
    updateGroupDirect(db, REPO, id, { memberIds: ['e1', 'e2', 'e3'] });
    const row = get<{ member_ids: string }>(db, 'SELECT member_ids FROM c4_manual_groups WHERE group_id=?', [id]);
    expect(JSON.parse(row!.member_ids)).toEqual(['e1', 'e2', 'e3']);
  });

  test('label null 更新', () => {
    const { id } = addGroupDirect(db, REPO, { memberIds: [], label: 'Labeled' });
    updateGroupDirect(db, REPO, id, { label: null });
    const row = get<{ label: string | null }>(db, 'SELECT label FROM c4_manual_groups WHERE group_id=?', [id]);
    expect(row!.label).toBeNull();
  });

  test('body が空オブジェクト（label キーなし・memberIds なし）は no-op', () => {
    const { id } = addGroupDirect(db, REPO, { memberIds: ['e1'], label: 'OriginalLabel' });
    updateGroupDirect(db, REPO, id, {});
    const row = get<{ member_ids: string; label: string }>(db, 'SELECT member_ids, label FROM c4_manual_groups WHERE group_id=?', [id]);
    expect(JSON.parse(row!.member_ids)).toEqual(['e1']);
    expect(row!.label).toBe('OriginalLabel');
  });
});

describe('removeGroupDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('削除確認', () => {
    const { id } = addGroupDirect(db, REPO, { memberIds: [] });
    removeGroupDirect(db, REPO, id);
    const row = get(db, 'SELECT * FROM c4_manual_groups WHERE group_id=?', [id]);
    expect(row).toBeUndefined();
  });
});

describe('addRelationshipDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('rel_id が rel_ 始まり', () => {
    const result = addRelationshipDirect(db, REPO, { fromId: 'e1', toId: 'e2' });
    expect(result.id).toMatch(/^rel_/);
  });

  test('SELECT で取得できる', () => {
    const { id } = addRelationshipDirect(db, REPO, { fromId: 'e1', toId: 'e2', label: 'uses', technology: 'HTTP' });
    const row = get<Record<string, unknown>>(db, 'SELECT * FROM c4_manual_relationships WHERE rel_id=?', [id]);
    expect(row).toBeDefined();
    expect(row!.from_id).toBe('e1');
    expect(row!.to_id).toBe('e2');
    expect(row!.label).toBe('uses');
    expect(row!.technology).toBe('HTTP');
  });
});

describe('removeRelationshipDirect', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(true); });
  afterEach(() => { db.close(); });

  test('削除確認', () => {
    const { id } = addRelationshipDirect(db, REPO, { fromId: 'e1', toId: 'e2' });
    removeRelationshipDirect(db, REPO, id);
    const row = get(db, 'SELECT * FROM c4_manual_relationships WHERE rel_id=?', [id]);
    expect(row).toBeUndefined();
  });
});
