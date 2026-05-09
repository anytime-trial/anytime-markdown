import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase2-${process.pid}-${Date.now()}.db`);
}

describe('Phase 2 migration', () => {
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

  test('creates memory_code_facts table', async () => {
    const { db, close } = await openFresh();

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = (tables[0]?.values ?? []).map((r) => r[0] as string);

    expect(names).toContain('memory_code_facts');

    close();
  }, 30000);

  test('memory_code_facts has correct columns', async () => {
    const { db, close } = await openFresh();

    const cols = db.exec("PRAGMA table_info(memory_code_facts)");
    const colNames = (cols[0]?.values ?? []).map((r) => r[1] as string);

    expect(colNames).toContain('id');
    expect(colNames).toContain('repo_name');
    expect(colNames).toContain('file_path');
    expect(colNames).toContain('symbol_path');
    expect(colNames).toContain('fact_type');
    expect(colNames).toContain('fact_value');
    expect(colNames).toContain('line_start');
    expect(colNames).toContain('line_end');
    expect(colNames).toContain('commit_sha');
    expect(colNames).toContain('recorded_at');

    close();
  }, 30000);

  test('memory_code_facts CHECK rejects invalid fact_type', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_code_facts (id, repo_name, file_path, fact_type, fact_value, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['id1', 'repo', 'src/foo.ts', 'bad_type', 'value', '2026-05-08T00:00:00.000Z']
      );
    }).toThrow();

    close();
  }, 30000);

  test('memory_code_facts CHECK rejects bad recorded_at', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_code_facts (id, repo_name, file_path, fact_type, fact_value, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['id2', 'repo', 'src/foo.ts', 'imports', 'value', '2026-05-08 00:00:00']
      );
    }).toThrow();

    close();
  }, 30000);

  test('memory_code_facts accepts valid row with ms timestamp', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_code_facts (id, repo_name, file_path, fact_type, fact_value, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['id3', 'anytime-markdown', 'src/index.ts', 'imports', 'fs', '2026-05-08T12:00:00.000Z']
      );
    }).not.toThrow();

    close();
  }, 30000);

  test('memory_code_facts accepts valid row without ms', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_code_facts (id, repo_name, file_path, fact_type, fact_value, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['id4', 'anytime-markdown', 'src/index.ts', 'calls', 'foo', '2026-05-08T12:00:00Z']
      );
    }).not.toThrow();

    close();
  }, 30000);

  test('indexes are created for memory_code_facts', async () => {
    const { db, close } = await openFresh();

    const indexes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memory_code_facts' ORDER BY name"
    );
    const indexNames = (indexes[0]?.values ?? []).map((r) => r[0] as string);

    expect(indexNames).toContain('idx_memory_code_facts_file');
    expect(indexNames).toContain('idx_memory_code_facts_type');
    expect(indexNames).toContain('idx_memory_code_facts_value');
    expect(indexNames).toContain('idx_memory_code_facts_commit');
    expect(indexNames).toContain('idx_memory_code_facts_repo_file');

    close();
  }, 30000);

  test('seed: rationale_for relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'rationale_for'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: imports_module relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'imports_module'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('_migrations has version=2 entry', async () => {
    const { db, close } = await openFresh();

    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);

    expect(versions).toContain(1);
    expect(versions).toContain(2);

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
    // migrations 1–4, each applied exactly once
    expect(count).toBe(4);
    close2();
  }, 30000);
});
