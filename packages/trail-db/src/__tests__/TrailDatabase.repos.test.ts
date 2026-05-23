import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};
const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const seedRelease = (db: TrailDatabase, tag: string, repoName: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO releases (tag, released_at, repo_name) VALUES (?, ?, ?)`,
    [tag, '2026-01-01T00:00:00.000Z', repoName],
  );
};

describe('TrailDatabase repos (Phase A: repo 正規化基盤)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  describe('repos テーブルと listRepos', () => {
    it('新規 in-memory DB では repos は空', () => {
      expect(db.listRepos()).toEqual([]);
    });
  });

  describe('repoIdForName (upsert)', () => {
    it('新規 repo_name を登録し repo_id を返す', () => {
      const id = db.repoIdForName('alpha');
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
      expect(db.listRepos()).toEqual([{ repoId: id, repoName: 'alpha' }]);
    });

    it('同じ repo_name の再呼び出しは同一 id を返す (冪等・重複登録しない)', () => {
      const id1 = db.repoIdForName('beta');
      const id2 = db.repoIdForName('beta');
      expect(id2).toBe(id1);
      expect(db.listRepos().filter((r) => r.repoName === 'beta')).toHaveLength(1);
    });

    it('空文字 repo_name (sentinel) も登録できる', () => {
      const id = db.repoIdForName('');
      expect(id).toBeGreaterThan(0);
      expect(db.repoNameForId(id)).toBe('');
    });
  });

  describe('repoNameForId', () => {
    it('repo_id → repo_name の往復が一致する', () => {
      const id = db.repoIdForName('gamma');
      expect(db.repoNameForId(id)).toBe('gamma');
    });

    it('未知の repo_id は null を返す', () => {
      expect(db.repoNameForId(999999)).toBeNull();
    });
  });

  describe('syncReposFromLegacyRepoNames', () => {
    it('既存テーブルの repo_name を repos へ取り込む (再実行可能)', () => {
      seedRelease(db, 'v1.0.0', 'repo-x');
      seedRelease(db, 'v1.1.0', 'repo-y');
      db.syncReposFromLegacyRepoNames();

      const names = db.listRepos().map((r) => r.repoName).sort();
      expect(names).toEqual(['repo-x', 'repo-y']);

      // 再実行しても重複しない
      db.syncReposFromLegacyRepoNames();
      expect(db.listRepos()).toHaveLength(2);
    });

    it('repo_name="" を sentinel として取り込む', () => {
      seedRelease(db, 'v0', '');
      db.syncReposFromLegacyRepoNames();
      const id = db.repoIdForName('');
      expect(db.repoNameForId(id)).toBe('');
    });

    it('sync 後に repoIdForName で取れる id が seed 由来 id と一致する', () => {
      seedRelease(db, 'v2', 'repo-z');
      db.syncReposFromLegacyRepoNames();
      const seeded = db.listRepos().find((r) => r.repoName === 'repo-z');
      expect(seeded).toBeDefined();
      expect(db.repoIdForName('repo-z')).toBe(seeded!.repoId);
    });
  });
});
