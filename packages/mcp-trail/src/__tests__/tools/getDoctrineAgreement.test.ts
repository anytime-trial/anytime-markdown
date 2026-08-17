import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { handleGetDoctrineAgreement } from '../../tools/getDoctrineAgreement';

/**
 * 縮退可視化の regression test（proposal 20260815-adlc-evals-adoption 改善案 1）。
 *
 * 2026-08-15 に caravan-book.db の破損（malformed）で読み取りが失敗し、fail-open の
 * catch が activity.db のみへ縮退した結果、DB に 74 件の判断があるのに全指標 0 が
 * 返る無言故障が実測された。縮退したことは stderr にしか出ず、呼び出し側は
 * 「本当に 0 件」と区別できなかった。sourceErrors が縮退の事実を返り値で運ぶことを固定する。
 */
describe('handleGetDoctrineAgreement degradation visibility', () => {
  let ws: string;
  let savedTrailHome: string | undefined;

  const dbDir = () => path.join(ws, '.anytime', 'trail', 'db');

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'doctrine-agreement-test-'));
    fs.mkdirSync(dbDir(), { recursive: true });
    // resolveTrailHome は TRAIL_HOME を workspacePath 引数より優先するため、テスト中は外す
    savedTrailHome = process.env.TRAIL_HOME;
    delete process.env.TRAIL_HOME;
  });

  afterEach(() => {
    if (savedTrailHome !== undefined) process.env.TRAIL_HOME = savedTrailHome;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  function writeGarbageDb(name: string): void {
    // SQLite ヘッダを持たない不正ファイル（malformed 相当。open か初回クエリで失敗する）
    fs.writeFileSync(path.join(dbDir(), name), 'this is not a sqlite database');
  }

  function writeEmptyValidDb(name: string): void {
    const db = new Database(path.join(dbDir(), name));
    db.close();
  }

  test('reports sourceErrors when both DBs are unreadable (zeros are degraded, not truth)', async () => {
    writeGarbageDb('caravan-book.db');
    writeGarbageDb('activity.db');

    const result = await handleGetDoctrineAgreement({ workspacePath: ws });

    expect(result.total).toBe(0);
    expect(result.sourceErrors).toHaveLength(2);
    expect(result.sourceErrors.join('\n')).toContain('caravan-book.db');
    expect(result.sourceErrors.join('\n')).toContain('activity.db');
  });

  test('reports partial degradation when only caravan-book.db is unreadable', async () => {
    writeGarbageDb('caravan-book.db');
    writeEmptyValidDb('activity.db');

    const result = await handleGetDoctrineAgreement({ workspacePath: ws });

    expect(result.total).toBe(0);
    expect(result.sourceErrors).toHaveLength(1);
    expect(result.sourceErrors[0]).toContain('caravan-book.db');
  });

  test('returns empty sourceErrors when DBs are readable (true zero is distinguishable)', async () => {
    // テーブル未作成の空 DB は「テーブル不在 → 0 行」の正常経路（fetch 側の仕様）
    writeEmptyValidDb('caravan-book.db');
    writeEmptyValidDb('activity.db');

    const result = await handleGetDoctrineAgreement({ workspacePath: ws });

    expect(result.total).toBe(0);
    expect(result.sourceErrors).toEqual([]);
  });
});
