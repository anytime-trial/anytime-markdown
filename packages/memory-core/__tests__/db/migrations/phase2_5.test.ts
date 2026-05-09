import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase2_5-${process.pid}-${Date.now()}.db`);
}

describe('Phase 2.5 migration', () => {
  const dbs: string[] = [];

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {
        // ignore
      }
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  async function openFresh(): Promise<ReturnType<typeof openMemoryCoreDb>> {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    return openMemoryCoreDb();
  }

  test('memory_bug_fixes table is created', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_bug_fixes'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: fixes relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'fixes'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: affects relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'affects'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: caused_by relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'caused_by'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: introduced_by relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'introduced_by'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('_migrations has version=3 and version=4 entries', async () => {
    const { db, close } = await openFresh();

    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);

    expect(versions).toContain(1);
    expect(versions).toContain(2);
    expect(versions).toContain(3);
    expect(versions).toContain(4);

    close();
  }, 30000);

  test('migration is idempotent (open twice, no error)', async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;

    const { db: db1, save: save1, close: close1 } = await openMemoryCoreDb();
    save1();
    close1();

    const { db: db2, close: close2 } = await openMemoryCoreDb();
    const result = db2.exec('SELECT COUNT(*) FROM _migrations');
    const count = result[0]?.values[0][0] as number;
    expect(count).toBe(8); // migrations 1–7, each applied once
    close2();
  }, 30000);

  test('bug_entity_id FK violation throws', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_bug_fixes
           (id, commit_sha, bug_entity_id, package, category, subject_summary,
            committed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'bf-test-1',
          'abc123',
          'nonexistent-entity-id',
          'web-app',
          'regression',
          'test summary',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ]
      );
    }).toThrow();

    close();
  }, 30000);
});
