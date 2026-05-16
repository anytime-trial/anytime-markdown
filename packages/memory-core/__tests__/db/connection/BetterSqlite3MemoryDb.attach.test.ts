import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';

describe('BetterSqlite3MemoryDb.attach (readOnly URI mode)', () => {
  let trailDbPath: string;

  beforeAll(() => {
    trailDbPath = path.join(os.tmpdir(), `trail-attach-test-${Date.now()}.db`);
    const seed = new BetterSqlite3MemoryDb({ filePath: trailDbPath });
    seed.execMany(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, path TEXT) STRICT;
      INSERT INTO sessions VALUES ('sess1', '/path');
    `);
    seed.close();
  });

  afterAll(() => {
    if (fs.existsSync(trailDbPath)) fs.unlinkSync(trailDbPath);
  });

  test('readOnly=true 指定で attach すると trail.* への書き込みが拒否される', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    db.attach(trailDbPath, 'trail', true);
    const rows = db.exec('SELECT id FROM trail.sessions');
    expect(rows[0].values[0][0]).toBe('sess1');

    expect(() => db.run("INSERT INTO trail.sessions VALUES ('x', '/y')")).toThrow();
    db.close();
  });

  test('readOnly=false 指定で attach すると trail.* に書き込める', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    db.attach(trailDbPath, 'trail', false);
    db.run("INSERT INTO trail.sessions VALUES (?, ?)", ['tmp', '/tmp']);
    const rows = db.exec("SELECT id FROM trail.sessions WHERE id = 'tmp'");
    expect(rows[0].values.length).toBe(1);
    db.run("DELETE FROM trail.sessions WHERE id = 'tmp'");
    db.close();
  });
});
