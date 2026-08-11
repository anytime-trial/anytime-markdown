import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';

/**
 * read-only attach ガードの対象判定（spec §6.7 の実測起点リグレッション）。
 *
 * 旧実装は「文中のどこかに `trail.` が現れる INSERT/UPDATE/DELETE」を一律拒否した。
 * その結果 `UPDATE <main 表> ... WHERE x IN (SELECT ... FROM trail.*)` という
 * 読み取り副問い合わせ付きの正当な書込（backfillBugFixWorkspace）が毎回ブロックされ、
 * fail-open の呼び出し側で「エラーは握られ処理は続く」形の恒久欠落を作っていた
 * （本番実測: caravan_bug_fixes.workspace が 1,362 / 1,369 行空のまま）。
 */
describe('read-only attach guard targets the write destination, not any mention', () => {
  function makeDbs() {
    const main = BetterSqlite3CaravanDb.openInCaravan();
    main.run(`CREATE TABLE local_rows (id INTEGER PRIMARY KEY, note TEXT NOT NULL DEFAULT '')`);
    main.run(`INSERT INTO local_rows (id, note) VALUES (1, '')`);

    const trailHandle = BetterSqlite3CaravanDb.openInCaravan();
    trailHandle.run(`CREATE TABLE remote_rows (id INTEGER PRIMARY KEY, note TEXT NOT NULL)`);
    trailHandle.run(`INSERT INTO remote_rows (id, note) VALUES (1, 'from-trail')`);
    attachTrailDbFromHandle(main, trailHandle);
    return { main, trailHandle };
  }

  test('UPDATE on a main table with a trail.* read subquery is allowed', () => {
    const { main, trailHandle } = makeDbs();
    main.run(
      `UPDATE local_rows SET note = 'filled'
        WHERE id IN (SELECT id FROM trail.remote_rows)`,
    );
    const rows = main.exec(`SELECT note FROM local_rows WHERE id = 1`);
    expect(rows[0].values[0][0]).toBe('filled');
    trailHandle.close();
    main.close();
  });

  test('INSERT INTO a main table selecting from trail.* is allowed', () => {
    const { main, trailHandle } = makeDbs();
    main.run(`INSERT INTO local_rows (id, note) SELECT id + 1, note FROM trail.remote_rows`);
    const rows = main.exec(`SELECT COUNT(*) FROM local_rows`);
    expect(rows[0].values[0][0]).toBe(2);
    trailHandle.close();
    main.close();
  });

  test.each([
    [`UPDATE trail.remote_rows SET note = 'x'`],
    [`DELETE FROM trail.remote_rows`],
    [`INSERT INTO trail.remote_rows (id, note) VALUES (2, 'x')`],
    [`REPLACE INTO trail.remote_rows (id, note) VALUES (1, 'x')`],
    [`insert or ignore into TRAIL.remote_rows (id, note) VALUES (3, 'x')`],
  ])('writes targeting trail.* are still rejected: %s', (sql) => {
    const { main, trailHandle } = makeDbs();
    expect(() => main.run(sql)).toThrow(/read-only attached schema/);
    trailHandle.close();
    main.close();
  });
});
