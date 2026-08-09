import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbReadOnly } from '../../src/db/attach';

const trailDbPath = path.join(os.tmpdir(), `attach-trail-${process.pid}-${Date.now()}.db`);

beforeAll(() => {
  const seed = new BetterSqlite3CaravanDb({ filePath: trailDbPath });
  seed.execMany(`
    CREATE TABLE activity_sessions (id TEXT PRIMARY KEY, path TEXT) STRICT;
    INSERT INTO activity_sessions VALUES ('sess1', '/path');
  `);
  seed.close();
});

afterAll(() => {
  if (fs.existsSync(trailDbPath)) fs.unlinkSync(trailDbPath);
});

describe('attachTrailDbReadOnly', () => {
  test('attach 後に trail.activity_sessions を SELECT できる', async () => {
    const db = BetterSqlite3CaravanDb.openInCaravan();
    await attachTrailDbReadOnly(db, trailDbPath);
    const rows = db.exec('SELECT id FROM trail.activity_sessions');
    expect(rows[0].values[0][0]).toBe('sess1');
    db.close();
  });

  test('attach 後に trail.* への書き込みは拒否される', async () => {
    const db = BetterSqlite3CaravanDb.openInCaravan();
    await attachTrailDbReadOnly(db, trailDbPath);
    expect(() => db.run("INSERT INTO trail.activity_sessions VALUES ('x', '/y')")).toThrow();
    db.close();
  });
});
