/**
 * FileBackupManager の 2 GiB 崖と、失敗時のバックアップ消失。
 *
 * 事故（2026-07-17）: trail.db が 2 GiB を超え、`rotateBackups()` の
 * `fs.readFileSync(dbPath)` が RangeError を投げて `init()` ごと落ちた。
 * さらに generations=1 では「最古世代の削除」が readFileSync より前にあるため、
 * throw すると**唯一のバックアップを消したまま新規も作れない**。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileBackupManager } from '../FileBackupManager';

describe('FileBackupManager — 巨大 DB と失敗時の世代保護', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bak-huge-'));
    dbPath = path.join(dir, 'trail.db');
    fs.writeFileSync(dbPath, 'CURRENT-DB-CONTENT');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('圧縮に失敗しても既存世代を消さない（新規作成の成功後に入れ替える）', async () => {
    const bak1 = `${dbPath}.bak.1.gz`;
    fs.writeFileSync(bak1, 'PRECIOUS-OLD-BACKUP');
    const old = fs.readFileSync(bak1);

    // 圧縮段で失敗する状況を作る（実機では 2 GiB 超の readFileSync が RangeError）
    const manager = new FileBackupManager(dbPath, 1, 0);
    const boom = new Error('File size (2148704256) is greater than 2 GiB');
    const spy = jest
      .spyOn(manager as unknown as { compressTo: (s: string, d: string) => void }, 'compressTo')
      .mockImplementation(() => {
        throw boom;
      });

    try {
      expect(() => manager.maybeRotate()).toThrow(boom);
      // 失敗しても唯一のバックアップは残っていること
      expect(fs.existsSync(bak1)).toBe(true);
      expect(fs.readFileSync(bak1)).toEqual(old);
    } finally {
      spy.mockRestore();
    }
  });

  it('2 GiB を超えるサイズでも RangeError にならず、非圧縮で世代を残す', () => {
    // 実ファイルで 2 GiB を作るのは非現実的なので、上限側を 1 バイトに下げて
    // 「上限超え」の分岐へ入れる（fs.statSync は redefine 不可で spy できない）。
    const manager = new FileBackupManager(dbPath, 1, 0);
    (manager as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;

    expect(() => manager.maybeRotate()).not.toThrow();

    // gzip を諦めても .bak.1（非圧縮）でバックアップ自体は必ず残す
    expect(fs.existsSync(`${dbPath}.bak.1`)).toBe(true);
    expect(fs.readFileSync(`${dbPath}.bak.1`, 'utf8')).toBe('CURRENT-DB-CONTENT');
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
  });

  it('通常サイズでは従来どおり gzip 世代を作る', () => {
    const manager = new FileBackupManager(dbPath, 1, 0);
    expect(manager.maybeRotate()).toBe(true);
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(true);
  });

  it('非圧縮世代も listBackups に現れ、復元できる（見えない世代を作らない）', () => {
    const manager = new FileBackupManager(dbPath, 1, 0);
    (manager as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;
    manager.maybeRotate();

    // 一覧に出ないと UI からは「バックアップなし」に見えてしまう
    const listed = manager.listBackups();
    expect(listed.map((e) => e.path)).toContain(`${dbPath}.bak.1`);

    fs.writeFileSync(dbPath, 'CORRUPTED');
    const result = manager.restoreFromBackup(1);

    expect(result.restoredFrom).toBe(`${dbPath}.bak.1`);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('CURRENT-DB-CONTENT');
    expect(result.safetyCopy).not.toBeNull();
  });
});
