import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';

const tmpDb = path.join(os.tmpdir(), `memory-test-${process.pid}-${Date.now()}.db`);

afterAll(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch (_) {
    // ignore
  }
});

describe('migrations', () => {
  test('creates all Phase 1 tables', async () => {
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const { db, close } = await openMemoryCoreDb();

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = (tables[0]?.values ?? []).map((r) => r[0] as string);

    expect(names).toContain('memory_entities');
    expect(names).toContain('memory_episodes');
    expect(names).toContain('memory_edges');
    expect(names).toContain('memory_edge_invalidations');
    expect(names).toContain('memory_episode_entities');
    expect(names).toContain('memory_pipeline_state');
    expect(names).toContain('memory_pipeline_runs');
    expect(names).toContain('memory_failed_items');
    expect(names).toContain('memory_relation_types');
    expect(names).toContain('_migrations');

    close();
    delete process.env.MEMORY_CORE_DB_PATH;
  }, 30000);

  test('seed data: 15 relation types inserted', async () => {
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const { db, close } = await openMemoryCoreDb();

    const result = db.exec('SELECT COUNT(*) FROM memory_relation_types');
    const count = result[0]?.values[0][0] as number;
    // Phase 1: 15 seeds, Phase 2 adds rationale_for + imports_module = 17, Phase 2.7 adds 4 = 21 total
    expect(count).toBe(21);

    close();
    delete process.env.MEMORY_CORE_DB_PATH;
  }, 30000);

  test('migrations are idempotent (run twice)', async () => {
    const tmpDb2 = path.join(os.tmpdir(), `memory-test-idempotent-${process.pid}-${Date.now()}.db`);
    process.env.MEMORY_CORE_DB_PATH = tmpDb2;
    try {
      const { db: db1, save: save1, close: close1 } = await openMemoryCoreDb();
      save1();
      close1();

      const { db: db2, close: close2 } = await openMemoryCoreDb();
      const result = db2.exec('SELECT COUNT(*) FROM _migrations');
      const count = result[0]?.values[0][0] as number;
      expect(count).toBe(8); // migrations 1–7, each applied once
      close2();
    } finally {
      try {
        fs.unlinkSync(tmpDb2);
      } catch (_) {
        // ignore
      }
      delete process.env.MEMORY_CORE_DB_PATH;
    }
  }, 30000);
});
