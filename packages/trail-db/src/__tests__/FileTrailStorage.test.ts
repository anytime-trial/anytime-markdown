import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FileTrailStorage } from '../ITrailStorage';

// バックアップ・復元の詳細振る舞いは database-core 側の FileBackupManager.test.ts でカバーする。
// 本テストは FileTrailStorage が FileBackupManager に正しくデリゲートしていること、
// および ITrailStorage 固有 (readInitialBytes / save / identifier) が動作することのみ検証する。
describe('FileTrailStorage', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-file-storage-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('ITrailStorage primitives', () => {
    it('readInitialBytes returns null when DB does not exist yet', () => {
      expect(new FileTrailStorage(dbPath).readInitialBytes()).toBeNull();
    });

    it('readInitialBytes returns existing buffer', () => {
      fs.writeFileSync(dbPath, Buffer.from([1, 2, 3]));
      const bytes = new FileTrailStorage(dbPath).readInitialBytes();
      expect(Array.from(bytes!)).toEqual([1, 2, 3]);
    });

    it('identifier returns the dbPath', () => {
      expect(new FileTrailStorage(dbPath).identifier).toBe(dbPath);
    });

    it('getFilePath returns the dbPath', () => {
      expect(new FileTrailStorage(dbPath).getFilePath()).toBe(dbPath);
    });
  });

  describe('save() delegates rotation to FileBackupManager', () => {
    it('first save() rotates existing DB to .bak.1.gz (gzip compressed)', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileTrailStorage(dbPath).save(Buffer.from('new-content'));

      expect(fs.readFileSync(dbPath).toString()).toBe('new-content');
      const restored = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`)).toString();
      expect(restored).toBe('original');
    });

    it('subsequent saves within same instance do NOT re-rotate', () => {
      fs.writeFileSync(dbPath, Buffer.from('gen-A'));
      const storage = new FileTrailStorage(dbPath);
      storage.save(Buffer.from('gen-B'));
      storage.save(Buffer.from('gen-C'));

      expect(fs.readFileSync(dbPath).toString()).toBe('gen-C');
      const restored = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`)).toString();
      expect(restored).toBe('gen-A');
    });

    it('first save() on fresh path creates file without rotation', () => {
      new FileTrailStorage(dbPath).save(Buffer.from('fresh'));
      expect(fs.readFileSync(dbPath).toString()).toBe('fresh');
      expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
    });
  });

  describe('listBackups / restoreFromBackup pass-through', () => {
    it('listBackups returns entries when backups exist', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileTrailStorage(dbPath, 1, 0).save(Buffer.from('B'));

      const entries = new FileTrailStorage(dbPath, 1, 0).listBackups();
      expect(entries).toHaveLength(1);
      expect(entries[0].generation).toBe(1);
    });

    it('restoreFromBackup throws when generation does not exist', () => {
      expect(() => new FileTrailStorage(dbPath).restoreFromBackup(1)).toThrow(/Backup not found/);
    });

    it('restoreFromBackup writes back decompressed content', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileTrailStorage(dbPath).save(Buffer.from('corrupted'));

      const result = new FileTrailStorage(dbPath).restoreFromBackup(1);
      expect(fs.readFileSync(dbPath).toString()).toBe('original');
      expect(result.restoredFrom).toBe(`${dbPath}.bak.1.gz`);
      expect(result.safetyCopy).not.toBeNull();
    });
  });
});
