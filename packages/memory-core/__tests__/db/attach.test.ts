import initSqlJs from 'sql.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { Database } from 'sql.js';

const tmpMemDb = path.join(os.tmpdir(), `memory-attach-test-${process.pid}-${Date.now()}.db`);
let trailHandle: Database;

beforeAll(async () => {
  // Create minimal in-memory trail db (stays in the same WASM module)
  const SQL = await initSqlJs();
  trailHandle = new SQL.Database();
  trailHandle.run(`CREATE TABLE sessions (id TEXT PRIMARY KEY, path TEXT) STRICT`);
  trailHandle.run("INSERT INTO sessions VALUES ('sess1', '/path')");
});

afterAll(() => {
  trailHandle.close();
  try {
    fs.unlinkSync(tmpMemDb);
  } catch (_) {
    // ignore
  }
});

describe('ATTACH read-only guard', () => {
  test('SELECT from trail.sessions succeeds', async () => {
    process.env.MEMORY_CORE_DB_PATH = tmpMemDb;
    const { db, close } = await openMemoryCoreDb();
    attachTrailDbFromHandle(db, trailHandle);

    const result = db.exec('SELECT id FROM trail.sessions');
    expect(result[0]?.values[0][0]).toBe('sess1');

    close();
    delete process.env.MEMORY_CORE_DB_PATH;
  }, 30000);

  test('INSERT into trail.* throws', async () => {
    process.env.MEMORY_CORE_DB_PATH = tmpMemDb;
    const { db, close } = await openMemoryCoreDb();
    attachTrailDbFromHandle(db, trailHandle);

    expect(() => {
      db.run("INSERT INTO trail.sessions (id, path) VALUES ('x', '/x')");
    }).toThrow(/trail\.\* is forbidden/);

    close();
    delete process.env.MEMORY_CORE_DB_PATH;
  }, 30000);

  test('failed_items recorded after blocked write', async () => {
    process.env.MEMORY_CORE_DB_PATH = tmpMemDb;
    const { db, close } = await openMemoryCoreDb();
    attachTrailDbFromHandle(db, trailHandle);

    try {
      db.run("INSERT INTO trail.sessions (id, path) VALUES ('y', '/y')");
    } catch (_) {
      // expected
    }

    const result = db.exec(
      "SELECT COUNT(*) FROM memory_failed_items WHERE scope='trail_db_write_attempt'"
    );
    const count = result[0]?.values[0][0] as number;
    expect(count).toBeGreaterThan(0);

    close();
    delete process.env.MEMORY_CORE_DB_PATH;
  }, 30000);
});
