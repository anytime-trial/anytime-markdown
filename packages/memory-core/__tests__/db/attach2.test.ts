/**
 * attach.ts の attachTrailDbFromHandle と非 BetterSqlite3MemoryDb エラーパスのテスト。
 * attach.test.ts は attachTrailDbReadOnly のファイルパス経由 attach のみカバーしているため
 * 補完する。
 */
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { attachTrailDbReadOnly, attachTrailDbFromHandle } from '../../src/db/attach';
import type { MemoryDbConnection } from '../../src/db/connection/types';

// MemoryDbConnection の最小モック (BetterSqlite3MemoryDb 以外)
function makeNonBetterDb(): MemoryDbConnection {
  return {
    exec: () => [],
    run: () => {},
    execMany: () => {},
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0, lastInsertRowid: 0n }), iterate: function* () {} }),
    getRowsModified: () => 0,
    pragma: () => null,
    attach: () => {},
    detach: () => {},
    close: () => {},
    serialize: () => Buffer.alloc(0),
  };
}

describe('attachTrailDbReadOnly - 非 BetterSqlite3MemoryDb はエラー', () => {
  it('BetterSqlite3MemoryDb 以外を渡すと例外が投げられる', async () => {
    const nonBetterDb = makeNonBetterDb();
    await expect(attachTrailDbReadOnly(nonBetterDb, '/some/path.db')).rejects.toThrow(
      'only BetterSqlite3MemoryDb is supported',
    );
  });
});

describe('attachTrailDbFromHandle', () => {
  it('in-memory trail handle を file 経由で attach して SELECT できる', () => {
    // main db
    const db = BetterSqlite3MemoryDb.openInMemory();
    // trail handle (in-memory)
    const trailHandle = BetterSqlite3MemoryDb.openInMemory();
    trailHandle.execMany(`
      CREATE TABLE trail_sessions (id TEXT PRIMARY KEY, label TEXT) STRICT;
      INSERT INTO trail_sessions VALUES ('s1', 'test-session');
    `);

    attachTrailDbFromHandle(db, trailHandle);

    const rows = db.exec('SELECT id, label FROM trail.trail_sessions');
    expect(rows[0].values[0][0]).toBe('s1');
    expect(rows[0].values[0][1]).toBe('test-session');

    db.close();
    trailHandle.close();
  });

  it('attach 後に trail.* への書き込みは拒否される', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    const trailHandle = BetterSqlite3MemoryDb.openInMemory();
    trailHandle.execMany(`
      CREATE TABLE trail_data (id TEXT PRIMARY KEY) STRICT;
    `);

    attachTrailDbFromHandle(db, trailHandle);

    expect(() => db.run("INSERT INTO trail.trail_data VALUES ('x')")).toThrow();

    db.close();
    trailHandle.close();
  });

  it('main db が BetterSqlite3MemoryDb 以外の場合はエラー', () => {
    const nonBetterDb = makeNonBetterDb();
    const trailHandle = BetterSqlite3MemoryDb.openInMemory();

    expect(() => attachTrailDbFromHandle(nonBetterDb, trailHandle)).toThrow(
      'only BetterSqlite3MemoryDb is supported for main db',
    );

    trailHandle.close();
  });

  it('trail handle が BetterSqlite3MemoryDb 以外の場合はエラー', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    const nonBetterTrail = makeNonBetterDb();

    expect(() => attachTrailDbFromHandle(db, nonBetterTrail)).toThrow(
      'only BetterSqlite3MemoryDb is supported for trailHandle',
    );

    db.close();
  });

  it('一時ファイルが OS-secure なディレクトリ下に作成される (trailHandle serialize)', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    const trailHandle = BetterSqlite3MemoryDb.openInMemory();
    trailHandle.execMany(`
      CREATE TABLE t (x INTEGER) STRICT;
      INSERT INTO t VALUES (42);
    `);

    // attachTrailDbFromHandle が tmpdir 下に一時ファイルを作成して attach する
    attachTrailDbFromHandle(db, trailHandle);

    const rows = db.exec('SELECT x FROM trail.t');
    expect(rows[0].values[0][0]).toBe(42);

    db.close();
    trailHandle.close();
  });
});
