import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FileTrailStorage } from '../ITrailStorage';

// バックアップ・復元の詳細振る舞いは database-core 側の FileBackupManager.test.ts でカバーする。
// 本テストは FileTrailStorage が以下を満たすことのみ検証する:
//   - save() は純粋な書き込みで、バックアップトリガを発火しない
//   - maybeRotateBackup() を明示呼び出しした時のみバックアップが作成される
//   - listBackups / restoreFromBackup は FileBackupManager にデリゲートされる
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

  describe('save() does NOT trigger backup', () => {
    it('save() writes bytes without creating .bak.1.gz', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileTrailStorage(dbPath).save(Buffer.from('new-content'));

      expect(fs.readFileSync(dbPath).toString()).toBe('new-content');
      expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
    });

    it('multiple save() calls without maybeRotateBackup never create backups', () => {
      fs.writeFileSync(dbPath, Buffer.from('gen-A'));
      const storage = new FileTrailStorage(dbPath);
      storage.save(Buffer.from('gen-B'));
      storage.save(Buffer.from('gen-C'));

      expect(fs.readFileSync(dbPath).toString()).toBe('gen-C');
      expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
    });
  });

  describe('maybeRotateBackup() is the explicit trigger', () => {
    it('first maybeRotateBackup() rotates existing DB to .bak.1.gz (gzip compressed)', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      const storage = new FileTrailStorage(dbPath);
      storage.maybeRotateBackup();

      const restored = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`)).toString();
      expect(restored).toBe('original');
    });

    it('maybeRotateBackup() then save() preserves pre-rotation snapshot and overwrites DB', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      const storage = new FileTrailStorage(dbPath);
      storage.maybeRotateBackup();
      storage.save(Buffer.from('new-content'));

      expect(fs.readFileSync(dbPath).toString()).toBe('new-content');
      const restored = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`)).toString();
      expect(restored).toBe('original');
    });

    it('second maybeRotateBackup() on same instance is no-op', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      const storage = new FileTrailStorage(dbPath, 3, 0);
      storage.maybeRotateBackup();
      fs.writeFileSync(dbPath, Buffer.from('B'));
      storage.maybeRotateBackup();

      expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(false);
      const bak1 = zlib.gunzipSync(fs.readFileSync(`${dbPath}.bak.1.gz`)).toString();
      expect(bak1).toBe('A');
    });
  });

  describe('listBackups / restoreFromBackup pass-through', () => {
    it('listBackups returns entries when backups exist', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileTrailStorage(dbPath, 1, 0).maybeRotateBackup();

      const entries = new FileTrailStorage(dbPath, 1, 0).listBackups();
      expect(entries).toHaveLength(1);
      expect(entries[0].generation).toBe(1);
    });

    it('restoreFromBackup throws when generation does not exist', () => {
      expect(() => new FileTrailStorage(dbPath).restoreFromBackup(1)).toThrow(/Backup not found/);
    });

    it('restoreFromBackup writes back decompressed content', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      const storage = new FileTrailStorage(dbPath);
      storage.maybeRotateBackup();
      storage.save(Buffer.from('corrupted'));

      const result = new FileTrailStorage(dbPath).restoreFromBackup(1);
      expect(fs.readFileSync(dbPath).toString()).toBe('original');
      expect(result.restoredFrom).toBe(`${dbPath}.bak.1.gz`);
      expect(result.safetyCopy).not.toBeNull();
    });
  });
});
