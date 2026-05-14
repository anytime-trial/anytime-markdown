
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
