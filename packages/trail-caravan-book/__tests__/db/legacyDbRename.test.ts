import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveDbWithLegacyRename } from '../../src/db/legacyDbRename';

describe('resolveDbWithLegacyRename', () => {
  let dir: string;
  let warnings: string[];
  const warn = (m: string) => warnings.push(m);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-db-rename-'));
    warnings = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const touch = (name: string, body = 'x') => fs.writeFileSync(path.join(dir, name), body);
  const names = () => fs.readdirSync(dir).sort();

  it('旧名だけ実在するとき -wal / -shm ごと新名へ rename して新名パスを返す', () => {
    touch('trail.db', 'base');
    touch('trail.db-wal', 'wal');
    touch('trail.db-shm', 'shm');

    const r = resolveDbWithLegacyRename({ dir, current: 'activity.db', legacy: 'trail.db', warn });

    expect(r).toEqual({ path: path.join(dir, 'activity.db'), renamed: true });
    expect(names()).toEqual(['activity.db', 'activity.db-shm', 'activity.db-wal']);
    expect(fs.readFileSync(path.join(dir, 'activity.db-wal'), 'utf8')).toBe('wal');
    expect(warnings.some((m) => m.includes('renamed trail.db -> activity.db'))).toBe(true);
  });

  it('新名が実在すれば旧名が残っていても触らない', () => {
    touch('activity.db', 'new');
    touch('trail.db', 'old');

    const r = resolveDbWithLegacyRename({ dir, current: 'activity.db', legacy: 'trail.db', warn });

    expect(r).toEqual({ path: path.join(dir, 'activity.db'), renamed: false });
    expect(names()).toEqual(['activity.db', 'trail.db']);
    expect(warnings).toEqual([]);
  });

  it('どちらも無ければ新名パスを返す（新規作成は呼び出し側の責務）', () => {
    const r = resolveDbWithLegacyRename({ dir, current: 'activity.db', legacy: 'trail.db', warn });

    expect(r).toEqual({ path: path.join(dir, 'activity.db'), renamed: false });
    expect(names()).toEqual([]);
  });

  it('途中の rename 失敗時は実施済み分を巻き戻し、旧名パスへ倒す', () => {
    touch('trail.db', 'base');
    touch('trail.db-wal', 'wal');

    let calls = 0;
    const failingRename = (from: string, to: string) => {
      calls += 1;
      if (calls === 2 && from.endsWith('-wal')) throw new Error('EACCES (simulated)');
      fs.renameSync(from, to);
    };

    const r = resolveDbWithLegacyRename({
      dir,
      current: 'activity.db',
      legacy: 'trail.db',
      warn,
      renameFn: failingRename,
    });

    expect(r.renamed).toBe(false);
    expect(r.path).toBe(path.join(dir, 'trail.db'));
    expect(names()).toEqual(['trail.db', 'trail.db-wal']);
    expect(warnings.some((m) => m.includes('failed to rename'))).toBe(true);
  });
});

describe('resolveDbWithLegacyRename: owner 間の並行 rename 排他', () => {
  let dir: string;
  let warnings: string[];
  const warn = (m: string) => warnings.push(m);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-db-rename-lock-'));
    warnings = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const touch = (name: string, body = 'x') => fs.writeFileSync(path.join(dir, name), body);

  it('ロックが他プロセスに保持されている間は移行を見送り、実在する旧名を開く', () => {
    touch('trail.db', 'base');
    touch('activity.db.rename-lock');

    const r = resolveDbWithLegacyRename({
      dir,
      current: 'activity.db',
      legacy: 'trail.db',
      warn,
      lockWaitTotalMs: 100,
    });

    expect(r).toEqual({ path: path.join(dir, 'trail.db'), renamed: false });
    expect(fs.existsSync(path.join(dir, 'trail.db'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'activity.db'))).toBe(false);
    expect(warnings.some((m) => m.includes('rename lock busy'))).toBe(true);
  });

  it('stale なロック（60 秒超）は除去して移行を実施する', () => {
    touch('trail.db', 'base');
    const lock = path.join(dir, 'activity.db.rename-lock');
    touch('activity.db.rename-lock');
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);

    const r = resolveDbWithLegacyRename({
      dir,
      current: 'activity.db',
      legacy: 'trail.db',
      warn,
      lockWaitTotalMs: 500,
    });

    expect(r).toEqual({ path: path.join(dir, 'activity.db'), renamed: true });
    expect(fs.existsSync(lock)).toBe(false);
    expect(warnings.some((m) => m.includes('stale rename lock'))).toBe(true);
  });

  it('rename 失敗時に旧名が消え新名が実在すれば（他プロセスが移設済み）新名を返す', () => {
    touch('trail.db', 'base');
    const failingRename = () => {
      // ロックを知らない他プロセス（旧ビルド等）が同瞬間に移設を完了した状況を再現する
      fs.renameSync(path.join(dir, 'trail.db'), path.join(dir, 'activity.db'));
      throw Object.assign(new Error('ENOENT (simulated)'), { code: 'ENOENT' });
    };

    const r = resolveDbWithLegacyRename({
      dir,
      current: 'activity.db',
      legacy: 'trail.db',
      warn,
      renameFn: failingRename,
    });

    expect(r).toEqual({ path: path.join(dir, 'activity.db'), renamed: false });
    expect(warnings.some((m) => m.includes('already migrated'))).toBe(true);
  });
});
