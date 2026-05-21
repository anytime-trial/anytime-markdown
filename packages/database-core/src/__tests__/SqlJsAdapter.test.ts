import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { SqlJsAdapter } from '../SqlJsAdapter';

const FIXTURE = join(__dirname, 'fixtures', 'sample.sqlite');

/** FK を持つテーブルを含む sql.js の Uint8Array を生成する */
async function createFkDbBytes(): Promise<Uint8Array> {
  const SQL = await initSqlJs({});
  const db = new SQL.Database();
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      dept_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY,
      dept_id INTEGER NOT NULL REFERENCES departments
    );
    INSERT INTO departments VALUES (1, 'Eng');
    INSERT INTO employees VALUES (1, 1, 'Alice');
    INSERT INTO contracts VALUES (1, 1);
  `);
  const bytes = db.export();
  db.close();
  return bytes;
}

/** NULL・BLOB・object を含む行を持つ sql.js の Uint8Array を生成する */
async function createSpecialCellDbBytes(): Promise<Uint8Array> {
  const SQL = await initSqlJs({});
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, data BLOB, label TEXT);
    INSERT INTO items VALUES (1, NULL, 'no-blob');
    INSERT INTO items VALUES (2, X'DEADBE', 'blob-row');
  `);
  const bytes = db.export();
  db.close();
  return bytes;
}

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

  it('create with locateWasm option: adapter opens and works correctly', async () => {
    // locateWasm を指定したときのパス (L30) をカバーする。
    // sql.js の initSqlJs に { locateFile: locateWasm } が渡されるパスが実行される。
    // テスト環境では wasm が既にキャッシュされるため locateWasm 自体は呼ばれないが、
    // 分岐コードが実行されて正常に動作することを検証する。
    const bytes = readFileSync(FIXTURE);
    const locateWasm = (_file: string) => _file;
    const a = await SqlJsAdapter.create({
      bytes: new Uint8Array(bytes),
      openMode: 'readonly',
      locateWasm,
    });
    expect(await a.countRows('users')).toBe(100);
    await a.dispose();
  });

  it('executeSql returns SELECT result with isMutation=false', async () => {
    const bytes = readFileSync(FIXTURE);
    const a = await SqlJsAdapter.create({ bytes: new Uint8Array(bytes), openMode: 'readwrite' });
    const r = await a.executeSql('SELECT id, name FROM users WHERE id < 4');
    expect(r.isMutation).toBe(false);
    expect(r.columns).toEqual(['id', 'name']);
    expect(r.rows).toHaveLength(3);
    await a.dispose();
  });

  it('listSchema includes foreignKeys when table has FK constraints', async () => {
    const bytes = await createFkDbBytes();
    const a = await SqlJsAdapter.create({ bytes, openMode: 'readonly' });
    const schema = await a.listSchema();
    const empTable = schema.tables.find((t) => t.name === 'employees');
    expect(empTable).toBeDefined();
    expect(empTable?.foreignKeys).toBeDefined();
    expect(empTable?.foreignKeys).toHaveLength(1);
    expect(empTable?.foreignKeys![0]).toMatchObject({
      fromColumn: 'dept_id',
      toTable: 'departments',
    });
    // departments は FK なし → foreignKeys undefined (length 0 → no foreignKeys property)
    const deptTable = schema.tables.find((t) => t.name === 'departments');
    expect(deptTable?.foreignKeys).toBeUndefined();
    // contracts: REFERENCES departments（列名省略） → fk.to = null → toColumn = ''
    const contractsTable = schema.tables.find((t) => t.name === 'contracts');
    expect(contractsTable?.foreignKeys).toBeDefined();
    expect(contractsTable?.foreignKeys![0].toColumn).toBe('');
    await a.dispose();
  });

  it('selectRows formats NULL as empty string and BLOB as <BLOB:Nb>', async () => {
    const bytes = await createSpecialCellDbBytes();
    const a = await SqlJsAdapter.create({ bytes, openMode: 'readonly' });
    const r = await a.selectRows({ table: 'items', limit: 10, offset: 0 });
    // id=1: data=NULL → ''
    const nullRow = r.rows.find((row) => row[0] === '1');
    expect(nullRow?.[1]).toBe('');
    // id=2: data=BLOB(3 bytes) → '<BLOB:3b>'
    const blobRow = r.rows.find((row) => row[0] === '2');
    expect(blobRow?.[1]).toBe('<BLOB:3b>');
    await a.dispose();
  });
});
