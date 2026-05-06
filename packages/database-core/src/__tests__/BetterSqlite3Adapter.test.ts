import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BetterSqlite3Adapter } from '../BetterSqlite3Adapter';

const FIXTURE = join(__dirname, 'fixtures', 'sample.sqlite');

function withTempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'amd-db-'));
  const path = join(dir, 'sample.sqlite');
  copyFileSync(FIXTURE, path);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('BetterSqlite3Adapter', () => {
  it('listSchema returns tables and views', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const schema = await a.listSchema();
    expect(schema.tables.map((x) => x.name).sort()).toEqual(['posts', 'users']);
    expect(schema.views.map((x) => x.name)).toEqual(['v_user_post_count']);
    await a.dispose();
    t.cleanup();
  });

  it('selectRows returns paginated rows', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    const r = await a.selectRows({ table: 'users', limit: 10, offset: 0 });
    expect(r.columns).toEqual(['id', 'name', 'email']);
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0][1]).toBe('User 1');
    await a.dispose();
    t.cleanup();
  });

  it('countRows returns total row count', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
    t.cleanup();
  });

  it('rejects unsafe identifier in selectRows', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    await expect(a.selectRows({ table: '1bad', limit: 1, offset: 0 })).rejects.toThrow(/unsafe/);
    await a.dispose();
    t.cleanup();
  });

  it('executeSql isMutation=false for SELECT', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    const r = await a.executeSql('SELECT id, name FROM users WHERE id < 4');
    expect(r.isMutation).toBe(false);
    expect(r.rows).toHaveLength(3);
    await a.dispose();
    t.cleanup();
  });

  it('executeSql isMutation=true for INSERT and uncommitted', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    const r = await a.executeSql("INSERT INTO users(name,email) VALUES ('Alice', 'a@x.com')");
    expect(r.isMutation).toBe(true);
    expect(r.rowsAffected).toBe(1);
    expect(await a.countRows('users')).toBe(101);
    await a.dispose();
    t.cleanup();

    // ROLLBACK されているため別アダプタで再オープンすると 100 件のままであること
    const t2 = withTempDb();
    const a2 = new BetterSqlite3Adapter({ filePath: t2.path, openMode: 'readonly' });
    expect(await a2.countRows('users')).toBe(100);
    await a2.dispose();
    t2.cleanup();
  });

  it('save commits and persists changes', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    await a.executeSql("INSERT INTO users(name,email) VALUES ('Bob', 'b@x.com')");
    await a.save();
    await a.dispose();
    const a2 = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    expect(await a2.countRows('users')).toBe(101);
    await a2.dispose();
    t.cleanup();
  });

  it('revert rolls back uncommitted changes', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readwrite' });
    await a.executeSql("INSERT INTO users(name,email) VALUES ('Eve', 'e@x.com')");
    await a.revert();
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
    t.cleanup();
  });

  it('readonly mode rejects mutation SQL', async () => {
    const t = withTempDb();
    const a = new BetterSqlite3Adapter({ filePath: t.path, openMode: 'readonly' });
    await expect(
      a.executeSql("INSERT INTO users(name,email) VALUES ('X','x@x.com')"),
    ).rejects.toThrow(/read-only/i);
    await a.dispose();
    t.cleanup();
  });
});
