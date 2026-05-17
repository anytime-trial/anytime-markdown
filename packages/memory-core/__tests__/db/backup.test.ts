import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import { backupMemoryCoreDbFile } from '../../src/db/backup';

describe('backupMemoryCoreDbFile', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memcore-backup-'));
  });
  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  test('first call creates .bak.1.gz from existing db file', () => {
    const dbPath = path.join(tmpDir, 'memory-core.db');
    const payload = Buffer.from('SQLite DB body fixture');
    fs.writeFileSync(dbPath, payload);

    const created = backupMemoryCoreDbFile(dbPath, { backupIntervalDays: 0 });
    expect(created).toBe(true);

    const bakPath = `${dbPath}.bak.1.gz`;
    expect(fs.existsSync(bakPath)).toBe(true);
    const decompressed = zlib.gunzipSync(fs.readFileSync(bakPath));
    expect(decompressed.equals(payload)).toBe(true);
  });

  test('second call within interval is a no-op', () => {
    const dbPath = path.join(tmpDir, 'memory-core.db');
    fs.writeFileSync(dbPath, Buffer.from('v1'));

    expect(backupMemoryCoreDbFile(dbPath, { backupIntervalDays: 1 })).toBe(true);
    // overwrite db; if a 2nd backup ran, we'd see v2 contents in .bak.1.gz
    fs.writeFileSync(dbPath, Buffer.from('v2'));
    expect(backupMemoryCoreDbFile(dbPath, { backupIntervalDays: 1 })).toBe(false);

    const bakPath = `${dbPath}.bak.1.gz`;
    const decompressed = zlib.gunzipSync(fs.readFileSync(bakPath));
    expect(decompressed.toString()).toBe('v1');
  });

  test('rotates .bak.1.gz → .bak.2.gz when called with new content (interval=0)', () => {
    const dbPath = path.join(tmpDir, 'memory-core.db');
    fs.writeFileSync(dbPath, Buffer.from('gen-A'));
    backupMemoryCoreDbFile(dbPath, { backupGenerations: 2, backupIntervalDays: 0 });

    fs.writeFileSync(dbPath, Buffer.from('gen-B'));
    backupMemoryCoreDbFile(dbPath, { backupGenerations: 2, backupIntervalDays: 0 });

    const bak1 = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`));
    const bak2 = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.2.gz`));
    expect(bak1.toString()).toBe('gen-B');
    expect(bak2.toString()).toBe('gen-A');
  });

  test('missing db file does not throw and creates no backup', () => {
    const dbPath = path.join(tmpDir, 'nonexistent.db');
    expect(() => backupMemoryCoreDbFile(dbPath, { backupIntervalDays: 0 })).not.toThrow();
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
  });

  test('backupGenerations <= 0 disables backup', () => {
    const dbPath = path.join(tmpDir, 'memory-core.db');
    fs.writeFileSync(dbPath, Buffer.from('data'));
    const created = backupMemoryCoreDbFile(dbPath, { backupGenerations: 0 });
    expect(created).toBe(false);
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
  });
});
