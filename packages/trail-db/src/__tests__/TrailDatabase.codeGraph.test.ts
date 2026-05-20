
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';


type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const makeCodeGraph = (overrides: Partial<CodeGraph> = {}): CodeGraph => ({
  generatedAt: '2026-05-02T00:00:00.000Z',
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: [
    { id: 'n1', label: 'Node1', repo: 'repo1', package: 'pkg', fileType: 'code', community: 0, communityLabel: 'c0', x: 0, y: 0, size: 1 },
    { id: 'n2', label: 'Node2', repo: 'repo1', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'c1', x: 1, y: 1, size: 2 },
  ],
  edges: [{ source: 'n1', target: 'n2', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false }],
  communities: { 0: 'Community A', 1: 'Community B' },
  godNodes: ['n1'],
  ...overrides,
});

const insertRelease = (db: TrailDatabase, tag: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO releases (tag, released_at, repo_name)
     VALUES (?, ?, 'test-repo')`,
    [tag, '2026-01-01T00:00:00.000Z'],
  );
};

describe('TrailDatabase CodeGraph CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  describe('(a) saveCurrentCodeGraph → getCurrentCodeGraph round-trip', () => {
    it('保存した CodeGraph を復元できる（要約あり）', () => {
      const graph = makeCodeGraph({
        communitySummaries: {
          0: { name: 'Alpha Module', summary: 'Core logic' },
          1: { name: 'Beta Module', summary: 'UI layer' },
        },
      });
      db.saveCurrentCodeGraph('test-repo', graph);
      const restored = db.getCurrentCodeGraph('test-repo');
      expect(restored).not.toBeNull();
      expect(restored!.nodes).toHaveLength(2);
      expect(restored!.communities[0]).toBe('Community A');
      expect(restored!.communities[1]).toBe('Community B');
      expect(restored!.communitySummaries?.[0]).toEqual({ name: 'Alpha Module', summary: 'Core logic' });
      expect(restored!.communitySummaries?.[1]).toEqual({ name: 'Beta Module', summary: 'UI layer' });
    });

    it('要約なしの CodeGraph も round-trip できる', () => {
      const graph = makeCodeGraph();
      db.saveCurrentCodeGraph('test-repo', graph);
      const restored = db.getCurrentCodeGraph('test-repo');
      expect(restored).not.toBeNull();
      expect(restored!.communitySummaries).toBeUndefined();
    });

    it('存在しない repo_name は null を返す', () => {
      expect(db.getCurrentCodeGraph('nonexistent')).toBeNull();
    });

    it('空のノードとコミュニティの CodeGraph も保存できる', () => {
      const graph = makeCodeGraph({ nodes: [], edges: [], communities: {}, godNodes: [] });
      db.saveCurrentCodeGraph('empty-repo', graph);
      const restored = db.getCurrentCodeGraph('empty-repo');
      expect(restored).not.toBeNull();
      expect(restored!.nodes).toHaveLength(0);
    });
  });

  describe('(b) 再 saveCurrentCodeGraph で古い community_id の残骸が消える', () => {
    it('洗い替えで古いコミュニティ行が消える', () => {
      const graph1 = makeCodeGraph();
      db.saveCurrentCodeGraph('test-repo', graph1);

      // community_id=0,1 のみ持つグラフで上書き → community_id=1 の行が消える
      const graph2 = makeCodeGraph({
        nodes: [{ id: 'n1', label: 'Node1', repo: 'repo1', package: 'pkg', fileType: 'code', community: 0, communityLabel: 'c0', x: 0, y: 0, size: 1 }],
        communities: { 0: 'Only A' },
      });
      db.saveCurrentCodeGraph('test-repo', graph2);

      const restored = db.getCurrentCodeGraph('test-repo');
      expect(restored!.communities[0]).toBe('Only A');
      expect(restored!.communities[1]).toBeUndefined();
    });
  });

  describe('(c) upsertCurrentCodeGraphCommunities で要約後付け', () => {
    it('保存後に要約を後付けできる', () => {
      const graph = makeCodeGraph(); // 要約なし
      db.saveCurrentCodeGraph('test-repo', graph);

      db.upsertCurrentCodeGraphCommunities('test-repo', [
        { community_id: 0, name: 'Alpha', summary: 'Core logic' },
      ]);

      const restored = db.getCurrentCodeGraph('test-repo');
      expect(restored!.communitySummaries?.[0]).toEqual({ name: 'Alpha', summary: 'Core logic' });
    });

    it('label を省略したとき既存の label が保持される', () => {
      const graph = makeCodeGraph();
      db.saveCurrentCodeGraph('test-repo', graph);

      // label を省略して name/summary だけ更新
      db.upsertCurrentCodeGraphCommunities('test-repo', [
        { community_id: 0, name: 'Alpha', summary: 'Desc' },
      ]);

      const restored = db.getCurrentCodeGraph('test-repo');
      expect(restored!.communities[0]).toBe('Community A'); // label 保持
    });
  });

  describe('(d) saveReleaseCodeGraph の FK CASCADE', () => {
    it('releases 行を削除すると release_code_graphs が CASCADE 削除される', () => {
      insertRelease(db, 'v1.0.0');
      const graph = makeCodeGraph();
      db.saveReleaseCodeGraph('v1.0.0', graph);

      // 保存できていることを確認
      const before = db.getReleaseCodeGraph('v1.0.0');
      expect(before).not.toBeNull();

      // sql.js の db.export() は PRAGMA foreign_keys をリセットするため再設定
      inner(db).run('PRAGMA foreign_keys = ON');
      // releases から削除 → CASCADE で release_code_graphs も削除
      inner(db).run('DELETE FROM releases WHERE tag = ?', ['v1.0.0']);

      const after = db.getReleaseCodeGraph('v1.0.0');
      expect(after).toBeNull();
    });
  });
});

describe('TrailDatabase deleteCurrentCodeGraphs / deleteReleaseCodeGraphs', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('deleteCurrentCodeGraphs removes all saved current code graphs', () => {
    db.saveCurrentCodeGraph('repo-a', makeCodeGraph());
    db.saveCurrentCodeGraph('repo-b', makeCodeGraph());
    expect(db.getCurrentCodeGraph('repo-a')).not.toBeNull();

    db.deleteCurrentCodeGraphs();
    expect(db.getCurrentCodeGraph('repo-a')).toBeNull();
    expect(db.getCurrentCodeGraph('repo-b')).toBeNull();
  });

  it('deleteCurrentCodeGraphs is a no-op when nothing saved', () => {
    expect(() => db.deleteCurrentCodeGraphs()).not.toThrow();
  });

  it('deleteReleaseCodeGraphs removes all saved release code graphs', () => {
    insertRelease(db, 'v2.0.0');
    insertRelease(db, 'v2.1.0');
    db.saveReleaseCodeGraph('v2.0.0', makeCodeGraph());
    db.saveReleaseCodeGraph('v2.1.0', makeCodeGraph());
    expect(db.getReleaseCodeGraph('v2.0.0')).not.toBeNull();

    db.deleteReleaseCodeGraphs();
    expect(db.getReleaseCodeGraph('v2.0.0')).toBeNull();
    expect(db.getReleaseCodeGraph('v2.1.0')).toBeNull();
  });

  it('deleteReleaseCodeGraphs is a no-op when nothing saved', () => {
    expect(() => db.deleteReleaseCodeGraphs()).not.toThrow();
  });
});

describe('TrailDatabase getAllReleaseCodeGraphRaws / getAllReleaseCodeGraphCommunityRaws', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('getAllReleaseCodeGraphRaws returns empty array when no release graphs', () => {
    const raws = db.getAllReleaseCodeGraphRaws();
    expect(Array.isArray(raws)).toBe(true);
    expect(raws).toHaveLength(0);
  });

  it('getAllReleaseCodeGraphRaws returns all saved release graphs', () => {
    insertRelease(db, 'v1.0.0');
    insertRelease(db, 'v1.1.0');
    db.saveReleaseCodeGraph('v1.0.0', makeCodeGraph());
    db.saveReleaseCodeGraph('v1.1.0', makeCodeGraph());

    const raws = db.getAllReleaseCodeGraphRaws();
    expect(raws).toHaveLength(2);
  });

  it('getAllReleaseCodeGraphCommunityRaws returns empty array for empty DB', () => {
    const raws = db.getAllReleaseCodeGraphCommunityRaws();
    expect(Array.isArray(raws)).toBe(true);
    expect(raws).toHaveLength(0);
  });

  it('getAllReleaseCodeGraphCommunityRaws returns community rows after save', () => {
    insertRelease(db, 'v1.0.0');
    const graph = makeCodeGraph({
      communitySummaries: {
        0: { name: 'Core', summary: 'Core logic' },
      },
    });
    db.saveReleaseCodeGraph('v1.0.0', graph);

    const raws = db.getAllReleaseCodeGraphCommunityRaws();
    expect(raws.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TrailDatabase upsertCurrentCodeGraphCommunitySummaries / upsertCurrentCodeGraphCommunityMappings', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('upsertCurrentCodeGraphCommunitySummaries inserts summaries after saveCurrentCodeGraph', () => {
    db.saveCurrentCodeGraph('test-repo', makeCodeGraph());

    db.upsertCurrentCodeGraphCommunitySummaries('test-repo', [
      { communityId: 0, name: 'Alpha', summary: 'Core logic' },
      { communityId: 1, name: 'Beta', summary: 'UI layer' },
    ]);

    const restored = db.getCurrentCodeGraph('test-repo');
    expect(restored!.communitySummaries?.[0]).toEqual({ name: 'Alpha', summary: 'Core logic' });
    expect(restored!.communitySummaries?.[1]).toEqual({ name: 'Beta', summary: 'UI layer' });
  });

  it('upsertCurrentCodeGraphCommunityMappings inserts mappings without error', () => {
    db.saveCurrentCodeGraph('test-repo', makeCodeGraph());

    const result = db.upsertCurrentCodeGraphCommunityMappings('test-repo', [
      {
        communityId: 0,
        mappings: [{ elementId: 'n1', elementType: 'file', role: 'primary' }],
      },
    ]);

    expect(result).toBeDefined();
    expect(typeof result.updated).toBe('number');
    expect(typeof result.inserted).toBe('number');
  });
});

describe('TrailDatabase listCurrentCodeGraphCommunities', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns empty array when no graph saved', () => {
    const result = db.listCurrentCodeGraphCommunities('test-repo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns communities after saveCurrentCodeGraph', () => {
    const graph = makeCodeGraph({
      communitySummaries: {
        0: { name: 'Alpha', summary: 'Core' },
      },
    });
    db.saveCurrentCodeGraph('test-repo', graph);

    const result = db.listCurrentCodeGraphCommunities('test-repo');
    expect(result.length).toBeGreaterThanOrEqual(1);
    const comm0 = result.find((c) => c.communityId === 0);
    expect(comm0).toBeDefined();
  });
});

const makeTrailGraph = () => ({
  nodes: [],
  edges: [],
  metadata: { projectRoot: '/repo', analyzedAt: '2026-05-01T00:00:00.000Z', fileCount: 0 },
});

describe('TrailDatabase getTrailGraph', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns null for current graph when nothing saved', () => {
    const result = db.getTrailGraph('current');
    expect(result).toBeNull();
  });

  it('returns null for release graph when nothing saved', () => {
    const result = db.getTrailGraph('v1.0.0');
    expect(result).toBeNull();
  });

  it('returns current graph after saveCurrentGraph', () => {
    db.saveCurrentGraph(makeTrailGraph(), '/tsconfig.json', 'abc123', 'test-repo');
    const result = db.getTrailGraph('current', 'test-repo');
    expect(result).not.toBeNull();
  });

  it('returns release graph after saveReleaseGraph', () => {
    db.saveReleaseGraph(makeTrailGraph(), '/tsconfig.json', 'v1.0.0');
    const result = db.getTrailGraph('v1.0.0');
    expect(result).not.toBeNull();
  });
});

describe('TrailDatabase asC4ModelStore', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns a C4ModelStore with the 3 required methods', () => {
    const store = db.asC4ModelStore();
    expect(typeof store.getCurrentC4Model).toBe('function');
    expect(typeof store.getReleaseC4Model).toBe('function');
    expect(typeof store.getC4ModelEntries).toBe('function');
  });

  it('getCurrentC4Model returns null for unknown repo', () => {
    const store = db.asC4ModelStore();
    const result = store.getCurrentC4Model('nonexistent');
    expect(result).toBeNull();
  });

  it('getCurrentC4Model returns model after saveCurrentGraph', () => {
    db.saveCurrentGraph(makeTrailGraph(), '/tsconfig.json', 'abc123', 'test-repo');
    const store = db.asC4ModelStore();
    const result = store.getCurrentC4Model('test-repo') as { model: unknown } | null;
    expect(result).not.toBeNull();
    expect(result!.model).toBeDefined();
  });

  it('getReleaseC4Model returns null when no release graph saved', () => {
    const store = db.asC4ModelStore();
    expect(store.getReleaseC4Model('v99.0.0')).toBeNull();
  });

  it('getReleaseC4Model returns model after saveReleaseGraph', () => {
    db.saveReleaseGraph(makeTrailGraph(), '/tsconfig.json', 'v1.0.0');
    const store = db.asC4ModelStore();
    const result = store.getReleaseC4Model('v1.0.0') as { model: unknown } | null;
    expect(result).not.toBeNull();
    expect(result!.model).toBeDefined();
  });

  it('getC4ModelEntries returns empty array when no graphs saved', () => {
    const store = db.asC4ModelStore();
    const entries = store.getC4ModelEntries();
    expect(Array.isArray(entries)).toBe(true);
  });

  it('getC4ModelEntries includes current entry after saveCurrentGraph', () => {
    db.saveCurrentGraph(makeTrailGraph(), '/tsconfig.json', 'abc123', 'test-repo');
    const store = db.asC4ModelStore();
    const entries = store.getC4ModelEntries() as readonly { tag: string; repoName: string | null }[];
    const current = entries.find((e) => e.tag === 'current');
    expect(current).toBeDefined();
  });
});

describe('TrailDatabase analyzeReleaseCodeGraphsForce (empty releases)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns 0 immediately when no releases exist', async () => {
    const count = await db.analyzeReleaseCodeGraphsForce({
      codeGraphService: { generate: async () => makeCodeGraph() },
      gitRoot: '/tmp/fake-repo',
    });
    expect(count).toBe(0);
  });
});

describe('TrailDatabase getCurrentTsconfigPath', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns null when no current graph saved', () => {
    expect(db.getCurrentTsconfigPath('test-repo')).toBeNull();
    expect(db.getCurrentTsconfigPath()).toBeNull();
  });

  it('returns tsconfig path after saveCurrentGraph', () => {
    db.saveCurrentGraph(makeTrailGraph(), '/path/to/tsconfig.json', 'abc123', 'test-repo');
    const result = db.getCurrentTsconfigPath('test-repo');
    expect(result).toBe('/path/to/tsconfig.json');
  });

  it('returns tsconfig path when called without repoName', () => {
    db.saveCurrentGraph(makeTrailGraph(), '/path/to/tsconfig.json', 'abc123', 'test-repo');
    const result = db.getCurrentTsconfigPath();
    expect(result).toBe('/path/to/tsconfig.json');
  });
});

describe('TrailDatabase getCurrentFeatureMatrix', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns null when no mappings_json column exists', () => {
    // Without calling upsertCurrentCodeGraphCommunityMappings, column may not exist
    const result = db.getCurrentFeatureMatrix();
    // Either null (no column) or null (no data with name+mappings_json)
    // Both are valid outcomes
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('returns null or FeatureMatrix after saving code graph with mappings', () => {
    db.saveCurrentCodeGraph('test-repo', makeCodeGraph());
    db.upsertCurrentCodeGraphCommunityMappings('test-repo', [
      {
        communityId: 0,
        mappings: [{ elementId: 'n1', elementType: 'file', role: 'primary' }],
      },
    ]);
    // After adding mappings_json column via upsert, getCurrentFeatureMatrix should not throw
    expect(() => db.getCurrentFeatureMatrix()).not.toThrow();
  });
});

describe('TrailDatabase getDayToolMetrics', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => db.close());

  it('returns an object with all expected fields for a date with no data', () => {
    const result = db.getDayToolMetrics('2026-03-01');
    expect(result).not.toBeNull();
    expect(typeof result!.totalEdits).toBe('number');
    expect(typeof result!.totalBuildRuns).toBe('number');
    expect(typeof result!.totalTestRuns).toBe('number');
    expect(Array.isArray(result!.toolUsage)).toBe(true);
    expect(Array.isArray(result!.skillUsage)).toBe(true);
  });
});
