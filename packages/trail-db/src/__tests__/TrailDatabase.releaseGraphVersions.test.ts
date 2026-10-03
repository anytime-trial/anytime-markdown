import type { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type RawDb = { run(sql: string, params?: unknown[]): void };
const rawDb = (db: TrailDatabase): RawDb => (db as unknown as { ensureDb(): RawDb }).ensureDb();

const graph = (analyzedAt: string) => ({
  metadata: { projectRoot: '/r', analyzedAt, version: '1', tsconfig: '', tsconfigPath: '' },
  nodes: [],
  edges: [],
}) as unknown as Parameters<TrailDatabase['saveReleaseGraph']>[0];

describe('TrailDatabase.getReleaseGraphVersions', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('release graph ごとに updated_at をバージョンとして返し、空なら analyzed_at を使う', () => {
    rawDb(db).run("INSERT INTO activity_releases (release_id, tag) VALUES (1, 'v1.0.0'), (2, 'v1.1.0'), (3, 'v1.2.0')");
    db.saveReleaseGraph(graph('2026-01-01T00:00:00.000Z'), '/tsconfig.json', 'v1.0.0');
    db.saveReleaseGraph(graph('2026-02-01T00:00:00.000Z'), '/tsconfig.json', 'v1.1.0');
    rawDb(db).run("UPDATE activity_release_graphs SET updated_at = '' WHERE release_id = 2");

    const versions = db.getReleaseGraphVersions();

    expect([...versions.keys()].sort()).toEqual([1, 2]);
    expect(versions.get(1)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(versions.get(2)).toBe('2026-02-01T00:00:00.000Z');
  });
});
