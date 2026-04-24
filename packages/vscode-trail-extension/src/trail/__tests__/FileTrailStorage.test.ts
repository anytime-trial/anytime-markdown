import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FileTrailStorage } from '../ITrailStorage';

describe('FileTrailStorage', () => {
  let dir: string;
  let dbPath: string;

  const readBak = (gen: number): string => {
    const compressed = fs.readFileSync(`${dbPath}.bak.${gen}.gz`);
    return zlib.gunzipSync(compressed).toString();
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-file-storage-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('readInitialBytes returns null when DB does not exist yet', () => {
    const storage = new FileTrailStorage(dbPath);
    expect(storage.readInitialBytes()).toBeNull();
  });

  it('readInitialBytes returns existing buffer', () => {
    fs.writeFileSync(dbPath, Buffer.from([1, 2, 3]));
    const storage = new FileTrailStorage(dbPath);
    const bytes = storage.readInitialBytes();
    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
  });

  it('first save() rotates existing DB to .bak.1.gz (gzip compressed)', () => {
    fs.writeFileSync(dbPath, Buffer.from('original'));
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('new-content'));

    expect(fs.readFileSync(dbPath).toString()).toBe('new-content');
    expect(readBak(1)).toBe('original');
    expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(false);
  });

  it('gzip backup is smaller than raw for highly-redundant data', () => {
    const redundant = Buffer.from('A'.repeat(100_000));
    fs.writeFileSync(dbPath, redundant);
    new FileTrailStorage(dbPath).save(Buffer.from('new'));

    const compressedSize = fs.statSync(`${dbPath}.bak.1.gz`).size;
    expect(compressedSize).toBeLessThan(redundant.length / 10);
  });

  it('subsequent saves within same session do NOT re-rotate', () => {
    fs.writeFileSync(dbPath, Buffer.from('gen-A'));
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('gen-B'));
    storage.save(Buffer.from('gen-C'));
    storage.save(Buffer.from('gen-D'));

    expect(fs.readFileSync(dbPath).toString()).toBe('gen-D');
    expect(readBak(1)).toBe('gen-A');
    expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(false);
  });

  it('new session shifts generations: bak.1 → bak.2, original → bak.1', () => {
    fs.writeFileSync(dbPath, Buffer.from('A'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('B'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('C'));

    expect(fs.readFileSync(dbPath).toString()).toBe('C');
    expect(readBak(1)).toBe('B');
    expect(readBak(2)).toBe('A');
    expect(fs.existsSync(`${dbPath}.bak.3.gz`)).toBe(false);
  });

  it('keeps at most 3 generations; oldest is discarded', () => {
    fs.writeFileSync(dbPath, Buffer.from('G0'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('G1'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('G2'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('G3'));
    new FileTrailStorage(dbPath, 3).save(Buffer.from('G4'));

    expect(fs.readFileSync(dbPath).toString()).toBe('G4');
    expect(readBak(1)).toBe('G3');
    expect(readBak(2)).toBe('G2');
    expect(readBak(3)).toBe('G1');
    expect(fs.existsSync(`${dbPath}.bak.4.gz`)).toBe(false);
  });

  it('first save() on fresh path creates file without rotation', () => {
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('fresh'));
    expect(fs.readFileSync(dbPath).toString()).toBe('fresh');
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
  });

  describe('listBackups', () => {
    it('returns empty array when no backups exist', () => {
      const storage = new FileTrailStorage(dbPath);
      expect(storage.listBackups()).toEqual([]);
    });

    it('returns entries in newest-first order with metadata', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileTrailStorage(dbPath, 3).save(Buffer.from('B'));
      new FileTrailStorage(dbPath, 3).save(Buffer.from('C'));

      const entries = new FileTrailStorage(dbPath, 3).listBackups();
      expect(entries).toHaveLength(2);
      expect(entries[0].generation).toBe(1);
      expect(entries[1].generation).toBe(2);
      expect(entries[0].path).toBe(`${dbPath}.bak.1.gz`);
      expect(entries[0].compressedSize).toBeGreaterThan(0);
      expect(Number.isFinite(entries[0].mtime.getTime())).toBe(true);
    });
  });

  describe('restoreFromBackup', () => {
    it('throws when specified generation does not exist', () => {
      const storage = new FileTrailStorage(dbPath);
      expect(() => storage.restoreFromBackup(1)).toThrow(/Backup not found/);
    });

    it('overwrites current DB with decompressed backup content', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileTrailStorage(dbPath).save(Buffer.from('corrupted'));

      const storage = new FileTrailStorage(dbPath);
      const result = storage.restoreFromBackup(1);

      expect(fs.readFileSync(dbPath).toString()).toBe('original');
      expect(result.restoredFrom).toBe(`${dbPath}.bak.1.gz`);
      expect(result.safetyCopy).not.toBeNull();
      expect(fs.readFileSync(result.safetyCopy!).toString()).toBe('corrupted');
    });

    it('creates safety copy of current DB before restore', () => {
      fs.writeFileSync(dbPath, Buffer.from('v1'));
      new FileTrailStorage(dbPath).save(Buffer.from('v2'));

      const storage = new FileTrailStorage(dbPath);
      const result = storage.restoreFromBackup(1);

      expect(result.safetyCopy).toMatch(/\.restore-safety-\d+$/);
      expect(fs.existsSync(result.safetyCopy!)).toBe(true);
    });

    it('skips safety copy when no current DB exists', () => {
      fs.writeFileSync(dbPath, Buffer.from('v1'));
      new FileTrailStorage(dbPath).save(Buffer.from('v2'));
      fs.unlinkSync(dbPath);

      const storage = new FileTrailStorage(dbPath);
      const result = storage.restoreFromBackup(1);

      expect(fs.readFileSync(dbPath).toString()).toBe('v1');
      expect(result.safetyCopy).toBeNull();
    });
  });
});
