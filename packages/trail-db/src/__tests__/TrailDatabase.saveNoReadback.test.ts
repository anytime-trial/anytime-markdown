/**
 * `TrailDatabase.save()` は file-backed のとき DB ファイルを読み戻さない。
 *
 * 事故（2026-07-17）: trail.db が 2 GiB を 1.2MB 超えた時点で拡張が起動不能になった。
 * 真因は sql.js 時代の名残で、`save()` が `export()`（= file-backed では
 * `fs.readFileSync(dbPath)`）でファイル全体を Buffer に読み、同じ内容を書き戻していたこと。
 * Node の Buffer 上限（2 GiB）を超えた瞬間に `RangeError` で init ごと落ちる。
 *
 * better-sqlite3 は書込時点でディスクへ永続化済みなので、この往復はそもそも不要。
 * 「読み戻さない」ことを契約として固定する（サイズ非依存＝崖を作らない）。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TrailDatabase, FileTrailStorage, InMemoryTrailStorage } from '../TrailDatabase';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

describe('TrailDatabase.save() — file-backed では読み戻さない', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-save-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('save() が storage.save へ入らない（= export の読み戻し往復に入らない）', () => {
    // storage.save(bytes) は必ず export() の直後に呼ばれるため、ここが呼ばれないことが
    // 「file-backed で 2.1GB を読み書きしていない」ことの観測点になる（fs を直接 spy すると
    // readFileSync が redefine 不可で spy できない）。
    const storage = new FileTrailStorage(dbPath, 0);
    const saveSpy = jest.spyOn(storage, 'save');
    const db = new TrailDatabase('/tmp', storage, undefined, silentLogger);
    db.init();

    try {
      saveSpy.mockClear();
      db.save();
      // 1 回でも入ると、DB が 2 GiB を超えた瞬間に RangeError で init ごと落ちる（実際の事故）
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
      db.close();
    }
  });

  it('save() が DB ファイルを書き戻さない（mtime が動かない）', async () => {
    const db = new TrailDatabase('/tmp', new FileTrailStorage(dbPath, 0), undefined, silentLogger);
    db.init();

    try {
      const before = fs.statSync(dbPath).mtimeMs;
      await new Promise((r) => setTimeout(r, 20));
      db.save();
      expect(fs.statSync(dbPath).mtimeMs).toBe(before);
    } finally {
      db.close();
    }
  });

  it('save() 後もデータは永続化されている（better-sqlite3 が書込済み）', () => {
    const db = new TrailDatabase('/tmp', new FileTrailStorage(dbPath, 0), undefined, silentLogger);
    db.init();
    db.recordSafePoint({
      createdAt: '2026-07-17T00:00:00.000Z',
      commitHash: 'abc1234',
      branch: 'develop',
      worktree: dir,
      label: 'test',
      source: 'manual',
      sessionId: null,
    });
    db.save();
    db.close();

    // 別インスタンスで開き直して読めることが「永続化されている」の実証
    const reopened = new TrailDatabase('/tmp', new FileTrailStorage(dbPath, 0), undefined, silentLogger);
    reopened.init();
    try {
      const points = reopened.listSafePoints(10);
      expect(points.map((p) => p.commitHash)).toContain('abc1234');
    } finally {
      reopened.close();
    }
  });

  it('in-memory ストレージでは従来どおり export → storage.save で永続化する', () => {
    // sql.js 互換の in-memory 経路は読み戻しでしか外へ出せないため挙動を変えない
    const storage = new InMemoryTrailStorage();
    const saveSpy = jest.spyOn(storage, 'save');
    const db = new TrailDatabase('/tmp', storage, undefined, silentLogger);
    db.init();
    try {
      db.save();
      expect(saveSpy).toHaveBeenCalled();
      expect((saveSpy.mock.calls[0]?.[0] as Uint8Array).byteLength).toBeGreaterThan(0);
    } finally {
      saveSpy.mockRestore();
      db.close();
    }
  });
});
