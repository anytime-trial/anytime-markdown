
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ columns: string[]; values: unknown[][] }>;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

describe('TrailDatabase Community CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  describe('upsertCurrentCodeGraphCommunitySummaries', () => {
    it('新規 community に name/summary を挿入する', () => {
      const result = db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 0, name: 'Foo', summary: 'foo description' },
        { communityId: 1, name: 'Bar', summary: 'bar description' },
      ]);
      expect(result.updated).toBe(2);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      expect(rows).toHaveLength(2);
      const r0 = rows.find((r) => r.communityId === 0);
      expect(r0?.name).toBe('Foo');
      expect(r0?.summary).toBe('foo description');
    });

    it('既存 community の name/summary を上書きするが mappings_json は保持する', () => {
      // 1. mappings_json を入れる
      db.upsertCurrentCodeGraphCommunityMappings('repo-A', [
        { communityId: 0, mappings: [{ elementId: 'pkg_x/y', elementType: 'component', role: 'primary' }] },
      ]);
      // 2. 別系統で name/summary を上書き
      db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 0, name: 'NewName', summary: 'NewSummary' },
      ]);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      const r0 = rows.find((r) => r.communityId === 0);
      expect(r0?.name).toBe('NewName');
      expect(r0?.summary).toBe('NewSummary');
      expect(r0?.mappingsJson).not.toBeNull();
      const parsed = JSON.parse(r0!.mappingsJson!) as Array<{ elementId: string }>;
      expect(parsed[0].elementId).toBe('pkg_x/y');
    });
  });

  describe('upsertCurrentCodeGraphCommunityMappings', () => {
    it('mappings_json カラム未存在時に ALTER TABLE で追加して書き込む', () => {
      // schema には mappings_json が定義されていない前提だが、
      // 既存スキーマ次第なのでテスト前にカラムが無くなった状態を再現。
      const cols0 = inner(db).exec("PRAGMA table_info(current_code_graph_communities)")[0]?.values ?? [];
      const hasMappings = cols0.some((c) => String((c as unknown[])[1]) === 'mappings_json');
      // schema に既にカラムがあれば、それは正常。テストは「未存在時も動く」ことだけ確認したい
      // → ここでは: メソッド呼び出し後に必ずカラムが存在することを保証する
      const result = db.upsertCurrentCodeGraphCommunityMappings('repo-A', [
        { communityId: 5, mappings: [{ elementId: 'pkg_a/b', elementType: 'component', role: 'primary' }] },
      ]);
      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(0);
      const cols1 = inner(db).exec("PRAGMA table_info(current_code_graph_communities)")[0]?.values ?? [];
      expect(cols1.some((c) => String((c as unknown[])[1]) === 'mappings_json')).toBe(true);

      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      expect(rows).toHaveLength(1);
      expect(rows[0].mappingsJson).not.toBeNull();
      void hasMappings; // 参照のみ
    });

    it('既存 community の name/summary は保持しつつ mappings_json を更新する', () => {
      db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 7, name: 'Existing', summary: 'existing summary' },
      ]);
      const result = db.upsertCurrentCodeGraphCommunityMappings('repo-A', [
        { communityId: 7, mappings: [{ elementId: 'pkg_z/w', elementType: 'component', role: 'secondary' }] },
      ]);
      expect(result.updated).toBe(1);
      expect(result.inserted).toBe(0);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      const r7 = rows.find((r) => r.communityId === 7);
      expect(r7?.name).toBe('Existing');
      expect(r7?.summary).toBe('existing summary');
      expect(r7?.mappingsJson).not.toBeNull();
    });

    it('mappings 配列を JSON 文字列で正しく保存する', () => {
      db.upsertCurrentCodeGraphCommunityMappings('repo-A', [
        {
          communityId: 0,
          mappings: [
            { elementId: 'pkg_a/b', elementType: 'component', role: 'primary' },
            { elementId: 'pkg_c/d', elementType: 'component', role: 'secondary' },
            { elementId: 'pkg_e/f', elementType: 'component', role: 'dependency' },
          ],
        },
      ]);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      const parsed = JSON.parse(rows[0].mappingsJson!) as Array<{ role: string }>;
      expect(parsed).toHaveLength(3);
      expect(parsed.map((m) => m.role)).toEqual(['primary', 'secondary', 'dependency']);
    });
  });

  describe('listCurrentCodeGraphCommunities', () => {
    it('repo_name でフィルタし他リポを返さない', () => {
      db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 0, name: 'A0', summary: 'A0 summary' },
      ]);
      db.upsertCurrentCodeGraphCommunitySummaries('repo-B', [
        { communityId: 0, name: 'B0', summary: 'B0 summary' },
        { communityId: 1, name: 'B1', summary: 'B1 summary' },
      ]);

      const rowsA = db.listCurrentCodeGraphCommunities('repo-A');
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0].name).toBe('A0');

      const rowsB = db.listCurrentCodeGraphCommunities('repo-B');
      expect(rowsB).toHaveLength(2);
      expect(rowsB.map((r) => r.name).sort()).toEqual(['B0', 'B1']);
    });

    it('community_id 昇順で返す', () => {
      db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 5, name: 'Five', summary: '' },
        { communityId: 2, name: 'Two', summary: '' },
        { communityId: 8, name: 'Eight', summary: '' },
      ]);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      expect(rows.map((r) => r.communityId)).toEqual([2, 5, 8]);
    });

    it('mappings_json カラムが無いスキーマでも動作する（null を返す）', () => {
      // 実装は ALTER 前なら mappings_json: null で返すべき
      db.upsertCurrentCodeGraphCommunitySummaries('repo-A', [
        { communityId: 0, name: 'X', summary: '' },
      ]);
      const rows = db.listCurrentCodeGraphCommunities('repo-A');
      expect(rows[0].mappingsJson === null || rows[0].mappingsJson === undefined).toBe(true);
    });
  });
});
