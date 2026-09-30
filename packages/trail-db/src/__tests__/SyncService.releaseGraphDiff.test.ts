import { SyncService } from '../SyncService';
import type { TrailDatabase } from '../TrailDatabase';
import { FakeRemoteStore } from './support/FakeRemoteStore';
import { createTestTrailDatabase } from './support/createTestDb';

type InnerDb = { run(sql: string, params?: unknown[]): void };
const inner = (db: TrailDatabase): InnerDb => (db as unknown as { ensureDb(): InnerDb }).ensureDb();

const graph = { metadata: { projectRoot: '/r', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' }, nodes: [], edges: [] } as unknown as Parameters<TrailDatabase['saveReleaseGraph']>[0];

function seedReleases(db: TrailDatabase, tags: readonly string[]): void {
  tags.forEach((tag, i) => {
    inner(db).run('INSERT INTO activity_releases (release_id, tag) VALUES (?, ?)', [i + 1, tag]);
    db.saveReleaseGraph(graph, '/tsconfig.json', tag);
  });
}

describe('SyncService の release graph 差分同期', () => {
  let db: TrailDatabase;
  let store: FakeRemoteStore;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
    store = new FakeRemoteStore();
    seedReleases(db, ['v1.0.0', 'v1.1.0', 'v1.2.0']);
  });
  afterEach(() => db.close());

  it('初回は全件を送り、2 回目は変わっていない graph を送らない', async () => {
    await new SyncService(db, store).sync();
    expect([...store.releaseGraphUpserts].sort()).toEqual([1, 2, 3]);

    store.releaseGraphUpserts = [];
    await new SyncService(db, store).sync();

    expect(store.releaseGraphUpserts).toEqual([]);
    expect([...store.releaseGraphs.keys()].sort()).toEqual([1, 2, 3]);
  });

  it('ローカルで更新された graph だけを送り直す', async () => {
    await new SyncService(db, store).sync();
    store.releaseGraphUpserts = [];
    inner(db).run("UPDATE activity_release_graphs SET updated_at = '2099-01-01T00:00:00.000Z' WHERE release_id = 2");

    await new SyncService(db, store).sync();

    expect(store.releaseGraphUpserts).toEqual([2]);
    expect(store.releaseGraphs.get(2)?.version).toBe('2099-01-01T00:00:00.000Z');
  });

  it('送信に失敗した graph は次回の同期で再送する', async () => {
    const original = store.upsertReleaseGraph.bind(store);
    store.upsertReleaseGraph = async (id, json, version) => {
      if (id === 3) throw new Error('gateway reset');
      return original(id, json, version);
    };
    const first = await new SyncService(db, store).sync();
    expect(first.errors).toBeGreaterThan(0);

    store.upsertReleaseGraph = original;
    store.releaseGraphUpserts = [];
    await new SyncService(db, store).sync();

    expect(store.releaseGraphUpserts).toEqual([3]);
  });

  it('ローカルから消えた release と graph をリモートからも消す', async () => {
    await new SyncService(db, store).sync();
    inner(db).run('DELETE FROM activity_releases WHERE release_id = 1');

    await new SyncService(db, store).sync();

    expect([...store.releaseIds].sort()).toEqual([2, 3]);
    expect([...store.releaseGraphs.keys()].sort()).toEqual([2, 3]);
  });

  it('release は残っていても graph だけ消えたらリモートの graph を消す', async () => {
    await new SyncService(db, store).sync();
    inner(db).run('DELETE FROM activity_release_graphs WHERE release_id = 2');

    await new SyncService(db, store).sync();

    expect([...store.releaseIds].sort()).toEqual([1, 2, 3]);
    expect([...store.releaseGraphs.keys()].sort()).toEqual([1, 3]);
  });

  it('削除済み release と同じ tag が別 release_id で再登録されても、旧 id を刈ってから登録する', async () => {
    await new SyncService(db, store).sync();
    inner(db).run('DELETE FROM activity_releases WHERE release_id = 1');
    inner(db).run("INSERT INTO activity_releases (release_id, tag) VALUES (10, 'v1.0.0')");
    db.saveReleaseGraph(graph, '/tsconfig.json', 'v1.0.0');

    const result = await new SyncService(db, store).sync();

    expect(result.errors).toBe(0);
    expect([...store.releaseIds].sort((a, b) => a - b)).toEqual([2, 3, 10]);
    expect([...store.releaseGraphs.keys()].sort((a, b) => a - b)).toEqual([2, 3, 10]);
  });

  it('ローカルの release が 0 件ならリモートの release と graph を刈らない', async () => {
    await new SyncService(db, store).sync();
    inner(db).run('DELETE FROM activity_releases');

    await new SyncService(db, store).sync();

    expect([...store.releaseIds].sort()).toEqual([1, 2, 3]);
    expect([...store.releaseGraphs.keys()].sort()).toEqual([1, 2, 3]);
  });
});
