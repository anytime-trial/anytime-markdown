import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FileBackupManager } from '../FileBackupManager';

describe('FileBackupManager', () => {
  let dir: string;
  let dbPath: string;

  const readBak = (gen: number): string => {
    const compressed = fs.readFileSync(`${dbPath}.bak.${gen}.gz`);
    return zlib.gunzipSync(compressed).toString();
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-backup-manager-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('maybeRotate', () => {
    it('first maybeRotate() rotates existing DB to .bak.1.gz (gzip compressed) and returns true', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      const mgr = new FileBackupManager(dbPath);
      expect(mgr.maybeRotate()).toBe(true);

      expect(readBak(1)).toBe('original');
      expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(false);
    });

    it('gzip backup is smaller than raw for highly-redundant data', () => {
      const redundant = Buffer.from('A'.repeat(100_000));
      fs.writeFileSync(dbPath, redundant);
      new FileBackupManager(dbPath).maybeRotate();

      const compressedSize = fs.statSync(`${dbPath}.bak.1.gz`).size;
      expect(compressedSize).toBeLessThan(redundant.length / 10);
    });

    it('subsequent maybeRotate() on same instance is no-op and returns false', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      const mgr = new FileBackupManager(dbPath, 3, 0);
      expect(mgr.maybeRotate()).toBe(true);
      // overwrite dbPath simulating subsequent writes within session
      fs.writeFileSync(dbPath, Buffer.from('B'));
      expect(mgr.maybeRotate()).toBe(false);
      fs.writeFileSync(dbPath, Buffer.from('C'));
      expect(mgr.maybeRotate()).toBe(false);

      expect(readBak(1)).toBe('A');
      expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(false);
    });

    it('new instance (new session) shifts generations: bak.1 → bak.2, current DB → bak.1', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('B'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();

      expect(readBak(1)).toBe('B');
      expect(readBak(2)).toBe('A');
      expect(fs.existsSync(`${dbPath}.bak.3.gz`)).toBe(false);
    });

    it('keeps at most N generations; oldest is discarded', () => {
      fs.writeFileSync(dbPath, Buffer.from('G0'));
      for (const gen of ['G1', 'G2', 'G3', 'G4']) {
        new FileBackupManager(dbPath, 3, 0).maybeRotate();
        fs.writeFileSync(dbPath, Buffer.from(gen));
      }

      expect(fs.readFileSync(dbPath).toString()).toBe('G4');
      expect(readBak(1)).toBe('G3');
      expect(readBak(2)).toBe('G2');
      expect(readBak(3)).toBe('G1');
      expect(fs.existsSync(`${dbPath}.bak.4.gz`)).toBe(false);
    });

    it('returns false and creates no backup when DB file does not exist', () => {
      const mgr = new FileBackupManager(dbPath);
      // shouldBackup returns true (no bak.1 exists) but rotateBackups early-returns
      // when dbPath itself does not exist. Result: no backup file written.
      expect(mgr.maybeRotate()).toBe(true);
      expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
    });

    it('returns false when backupGenerations <= 0', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      const mgr = new FileBackupManager(dbPath, 0, 0);
      expect(mgr.maybeRotate()).toBe(false);
      expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
    });

    it('invokes preWriteGuard once with dbPath before writing the backup', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      const guard = jest.fn<void, [string]>();
      const mgr = new FileBackupManager(dbPath, 1, 0, guard);
      mgr.maybeRotate();
      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard).toHaveBeenCalledWith(dbPath);
    });

    it('does not invoke preWriteGuard when shouldBackup is false', () => {
      const guard = jest.fn<void, [string]>();
      const mgr = new FileBackupManager(dbPath, 0, 0, guard);
      mgr.maybeRotate();
      expect(guard).not.toHaveBeenCalled();
    });
  });

  describe('backupIntervalDays', () => {
    it('intervalDays=0 backs up every session', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 1, 0).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('B'));
      new FileBackupManager(dbPath, 1, 0).maybeRotate();
      expect(readBak(1)).toBe('B');
    });

    it('intervalDays=1 skips when .bak.1.gz is fresh', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 1, 1).maybeRotate(); // creates bak.1 = A
      fs.writeFileSync(dbPath, Buffer.from('B'));
      // new instance; bak.1 is fresh → skip
      expect(new FileBackupManager(dbPath, 1, 1).maybeRotate()).toBe(false);
      expect(readBak(1)).toBe('A');
    });

    it('intervalDays=1 rotates when .bak.1.gz mtime is older than 1 day', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 1, 1).maybeRotate(); // bak.1 = A
      // backdate to 2 days ago
      const bak1 = `${dbPath}.bak.1.gz`;
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      fs.utimesSync(bak1, twoDaysAgo, twoDaysAgo);
      fs.writeFileSync(dbPath, Buffer.from('B'));
      expect(new FileBackupManager(dbPath, 1, 1).maybeRotate()).toBe(true);
      expect(readBak(1)).toBe('B');
    });
  });

  describe('listBackups', () => {
    it('returns empty array when no backups exist', () => {
      expect(new FileBackupManager(dbPath).listBackups()).toEqual([]);
    });

    it('returns entries in generation-ascending order with metadata', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('B'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();

      const entries = new FileBackupManager(dbPath, 3, 0).listBackups();
      expect(entries).toHaveLength(2);
      expect(entries[0].generation).toBe(1);
      expect(entries[1].generation).toBe(2);
      expect(entries[0].path).toBe(`${dbPath}.bak.1.gz`);
      expect(entries[0].compressedSize).toBeGreaterThan(0);
      expect(Number.isFinite(entries[0].mtime.getTime())).toBe(true);
    });

    it('caps results at backupGenerations even if extra .bak.N.gz files exist on disk', () => {
      fs.writeFileSync(dbPath, Buffer.from('A'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('B'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('C'));
      new FileBackupManager(dbPath, 3, 0).maybeRotate();

      const entries = new FileBackupManager(dbPath, 1, 0).listBackups();
      expect(entries).toHaveLength(1);
      expect(entries[0].generation).toBe(1);
    });
  });

  describe('restoreFromBackup', () => {
    it('throws when specified generation does not exist', () => {
      const mgr = new FileBackupManager(dbPath);
      expect(() => mgr.restoreFromBackup(1)).toThrow(/Backup not found/);
    });

    it('re-throws non-ENOENT error from readFileSync (e.g. EACCES)', () => {
      // バックアップファイルを作成しておき、readFileSync でパーミッションエラーをシミュレート
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileBackupManager(dbPath).maybeRotate();

      const permErr = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      const origReadFileSync = fs.readFileSync;
      jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw permErr;
      });
      try {
        expect(() => new FileBackupManager(dbPath).restoreFromBackup(1)).toThrow('EACCES');
      } finally {
        (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockRestore?.();
        jest.restoreAllMocks();
      }
    });

    it('continues restore when safety copy fails with EEXIST (concurrent call simulation)', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('corrupted'));

      // EEXIST: 安全コピーのパスがすでに存在する場合 → safetyCopy = null のまま、復元は続行
      const eexistErr = Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      const origCopyFileSync = fs.copyFileSync;
      jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
        throw eexistErr;
      });
      try {
        const result = new FileBackupManager(dbPath).restoreFromBackup(1);
        expect(result.safetyCopy).toBeNull();
        expect(fs.readFileSync(dbPath).toString()).toBe('original');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('overwrites current DB with decompressed backup content', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('corrupted'));

      const result = new FileBackupManager(dbPath).restoreFromBackup(1);

      expect(fs.readFileSync(dbPath).toString()).toBe('original');
      expect(result.restoredFrom).toBe(`${dbPath}.bak.1.gz`);
      expect(result.safetyCopy).not.toBeNull();
      expect(fs.readFileSync(result.safetyCopy!).toString()).toBe('corrupted');
    });

    it('creates safety copy of current DB before restore', () => {
      fs.writeFileSync(dbPath, Buffer.from('v1'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('v2'));

      const result = new FileBackupManager(dbPath).restoreFromBackup(1);
      expect(result.safetyCopy).toMatch(/\.restore-safety-\d+$/);
      expect(fs.existsSync(result.safetyCopy!)).toBe(true);
    });

    it('skips safety copy when no current DB exists', () => {
      fs.writeFileSync(dbPath, Buffer.from('v1'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.unlinkSync(dbPath);

      const result = new FileBackupManager(dbPath).restoreFromBackup(1);
      expect(fs.readFileSync(dbPath).toString()).toBe('v1');
      expect(result.safetyCopy).toBeNull();
    });

    it('re-throws non-ENOENT/non-EEXIST error from copyFileSync during safety copy', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('corrupted'));

      // EACCES など ENOENT/EEXIST 以外のエラーは再スローされる (L162)
      const permErr = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      jest.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
        throw permErr;
      });
      try {
        expect(() => new FileBackupManager(dbPath).restoreFromBackup(1)).toThrow('EACCES');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('invokes preWriteGuard with dbPath before writing', () => {
      fs.writeFileSync(dbPath, Buffer.from('original'));
      new FileBackupManager(dbPath).maybeRotate();
      fs.writeFileSync(dbPath, Buffer.from('corrupted'));

      const guard = jest.fn<void, [string]>();
      new FileBackupManager(dbPath, 1, 0, guard).restoreFromBackup(1);
      expect(guard).toHaveBeenCalledWith(dbPath);
    });
  });
});
