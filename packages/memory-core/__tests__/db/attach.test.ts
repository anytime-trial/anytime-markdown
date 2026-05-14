import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { attachTrailDbReadOnly } from '../../src/db/attach';

const trailDbPath = path.join(os.tmpdir(), `attach-trail-${process.pid}-${Date.now()}.db`);

beforeAll(() => {
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

describe('attachTrailDbReadOnly', () => {
  test('attach 後に trail.sessions を SELECT できる', async () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    await attachTrailDbReadOnly(db, trailDbPath);
    const rows = db.exec('SELECT id FROM trail.sessions');
    expect(rows[0].values[0][0]).toBe('sess1');
    db.close();
  });

  test('attach 後に trail.* への書き込みは拒否される', async () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    await attachTrailDbReadOnly(db, trailDbPath);
    expect(() => db.run("INSERT INTO trail.sessions VALUES ('x', '/y')")).toThrow();
    db.close();
  });
});
