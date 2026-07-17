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

  it('非圧縮世代でも interval 判定が効く（毎起動 2GB 再コピーしない）', () => {
    const manager = new FileBackupManager(dbPath, 1, 1);
    (manager as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;
    expect(manager.maybeRotate()).toBe(true);
    const first = fs.statSync(`${dbPath}.bak.1`).mtimeMs;

    // shouldBackup が .gz しか見ないと、非圧縮世代は「無い」扱いになり毎回作り直してしまう
    const next = new FileBackupManager(dbPath, 1, 1);
    (next as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;
    expect(next.maybeRotate()).toBe(false);
    expect(fs.statSync(`${dbPath}.bak.1`).mtimeMs).toBe(first);
  });

  it('generations=2 で非圧縮世代が世代シフトされ、保持上限も守られる', () => {
    const make = () => {
      const m = new FileBackupManager(dbPath, 2, 0);
      (m as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;
      return m;
    };
    fs.writeFileSync(dbPath, 'GEN-A');
    make().maybeRotate();
    fs.writeFileSync(dbPath, 'GEN-B');
    make().maybeRotate();

    // .gz しかシフトしないと GEN-A が世代 2 へ移らず握り潰される
    expect(fs.readFileSync(`${dbPath}.bak.1`, 'utf8')).toBe('GEN-B');
    expect(fs.readFileSync(`${dbPath}.bak.2`, 'utf8')).toBe('GEN-A');

    fs.writeFileSync(dbPath, 'GEN-C');
    make().maybeRotate();

    expect(fs.readFileSync(`${dbPath}.bak.1`, 'utf8')).toBe('GEN-C');
    expect(fs.readFileSync(`${dbPath}.bak.2`, 'utf8')).toBe('GEN-B');
    // 保持上限を超えた世代が残り続けない（disk leak 防止）
    expect(fs.existsSync(`${dbPath}.bak.3`)).toBe(false);
  });

  it('gzip 世代と非圧縮世代が混在しても同一系列としてシフトする', () => {
    fs.writeFileSync(dbPath, 'SMALL-GEN');
    const gzip = new FileBackupManager(dbPath, 2, 0);
    gzip.maybeRotate();
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(true);

    fs.writeFileSync(dbPath, 'HUGE-GEN');
    const huge = new FileBackupManager(dbPath, 2, 0);
    (huge as unknown as { maxGzipBytes: number }).maxGzipBytes = 1;
    huge.maybeRotate();

    // 直前の gz 世代は形式を保ったまま世代 2 へ退避される
    expect(fs.existsSync(`${dbPath}.bak.2.gz`)).toBe(true);
    expect(fs.readFileSync(`${dbPath}.bak.1`, 'utf8')).toBe('HUGE-GEN');
    // 同一世代に 2 形式が同居しない（どちらが最新か判別不能になるため）
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
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
