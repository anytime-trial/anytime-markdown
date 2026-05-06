import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqlJsAdapter } from '../SqlJsAdapter';

const FIXTURE = join(__dirname, 'fixtures', 'sample.sqlite');

describe('SqlJsAdapter', () => {
  it('listSchema and selectRows', async () => {
    const bytes = readFileSync(FIXTURE);
    const a = await SqlJsAdapter.create({ bytes: new Uint8Array(bytes), openMode: 'readwrite' });
    const schema = await a.listSchema();
    expect(schema.tables.map((x) => x.name).sort()).toEqual(['posts', 'users']);
    const r = await a.selectRows({ table: 'users', limit: 5, offset: 0 });
    expect(r.rows).toHaveLength(5);
    await a.dispose();
  });

  it('executeSql write changes are visible in same adapter and exportBytes', async () => {
    const bytes = readFileSync(FIXTURE);
    const a = await SqlJsAdapter.create({ bytes: new Uint8Array(bytes), openMode: 'readwrite' });
    const r = await a.executeSql("INSERT INTO users(name,email) VALUES ('X','x@x.com')");
    expect(r.isMutation).toBe(true);
    expect(await a.countRows('users')).toBe(101);
    const exported = a.exportBytes();
    expect(exported.byteLength).toBeGreaterThan(bytes.length - 1024);
    await a.dispose();
  });

  it('readonly mode rejects mutation SQL', async () => {
    const bytes = readFileSync(FIXTURE);
    const a = await SqlJsAdapter.create({ bytes: new Uint8Array(bytes), openMode: 'readonly' });
    await expect(a.executeSql('DELETE FROM users')).rejects.toThrow(/read-only/i);
    await a.dispose();
  });
});
