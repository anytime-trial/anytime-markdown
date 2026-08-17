/**
 * 外部キー違反の計数と修復を検査する。
 *
 * 論点は 3 つ。(1) 決定的に復元できる行だけを復元すること、(2) 復元できない行を
 * 黙って捏造しないこと、(3) 修復後に foreign_key_check が減ること。
 */

import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { entityId } from '../../src/canonical/entityId';
import {
  countDanglingReferences,
  unsafeRepairDanglingReferences,
} from '../../src/maintenance/repairDanglingReferences';

const TS = '2026-08-01T00:00:00.000Z';

async function makeDb(): Promise<BetterSqlite3CaravanDb> {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(db);
  // 本番と同じく FK 強制を切る。ここを ON のままにすると「参照先を失った行」を
  // fixture で作れず、修復対象そのものを再現できない（違反が蓄積するのは
  // まさに強制が切れているからである）。foreign_key_check は pragma と無関係に効く。
  db.run('PRAGMA foreign_keys = OFF');
  return db;
}

/** 参照先エンティティを作らずにレビュー行だけ入れる（障害で entity を失った状態）。 */
function insertReviewWithoutEntity(
  db: BetterSqlite3CaravanDb,
  id: string,
  sourceRef: string,
  reviewEntityId: string,
  title = 'Session review abcd1234',
): void {
  db.run(
    `INSERT INTO caravan_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title,
        body_excerpt, reviewed_at, recorded_at, workspace)
     VALUES (?, 'session', ?, ?, 'code', ?, '本文あり', ?, ?, 'anytime-markdown')`,
    [id, sourceRef, reviewEntityId, title, TS, TS],
  );
}

function insertBugFix(db: BetterSqlite3CaravanDb, id: string, episodeId: string | null): void {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, ?, ?, ?, ?)`,
    [`${id}-bug`, `bug-${id}`, `bug-${id}`, TS, TS, TS],
  );
  db.run(
    `INSERT INTO caravan_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary,
        root_cause_episode_id, committed_at, recorded_at, workspace)
     VALUES (?, ?, ?, 'pkg', 'logic', 'subject', ?, ?, ?, 'anytime-markdown')`,
    [id, `sha-${id}`, `${id}-bug`, episodeId, TS, TS],
  );
}

function fkViolations(db: BetterSqlite3CaravanDb): number {
  return (db as unknown as { pragma(n: string): unknown[] }).pragma('foreign_key_check').length;
}

describe('countDanglingReferences', () => {
  it('復元できる行とできない行を分けて数える', async () => {
    const db = await makeDb();
    const refOk = 'sess-1#uuid-1';
    insertReviewWithoutEntity(db, 'rev-ok', refOk, entityId('Review', refOk));
    // 保存済み id が導出値と一致しない行（復元すると二重ノードになるので対象外）
    insertReviewWithoutEntity(db, 'rev-odd', 'sess-2#uuid-2', 'deadbeefdeadbeef');
    insertBugFix(db, 'bugfix-dangling', 'no-such-episode');

    expect(countDanglingReferences(db)).toEqual({
      missingReviewEntities: 2,
      unreconstructableReviewEntities: 1,
      danglingBugFixEpisodeLinks: 1,
    });
    db.close();
  });

  it('数えるだけで 1 行も書かない', async () => {
    const db = await makeDb();
    const ref = 'sess-1#uuid-1';
    insertReviewWithoutEntity(db, 'rev-ok', ref, entityId('Review', ref));
    const before = fkViolations(db);
    countDanglingReferences(db);
    expect(fkViolations(db)).toBe(before);
    expect(db.exec(`SELECT COUNT(*) FROM caravan_entities`)[0].values[0][0]).toBe(0);
    db.close();
  });
});

describe('unsafeRepairDanglingReferences', () => {
  it('失われた Review エンティティを取込経路と同じ形で再生成する', async () => {
    const db = await makeDb();
    const ref = 'sess-1#uuid-1';
    insertReviewWithoutEntity(db, 'rev-ok', ref, entityId('Review', ref), 'Session review sess-1');

    const result = unsafeRepairDanglingReferences({ db });
    expect(result.repairedReviewEntities).toBe(1);

    const row = db.exec(
      `SELECT id, type, canonical_name, display_name, recorded_at FROM caravan_entities`,
    )[0].values[0];
    expect(row).toEqual([entityId('Review', ref), 'Review', ref, 'Session review sess-1', TS]);
    expect(fkViolations(db)).toBe(0);
    db.close();
  });

  it('id が導出値と一致しない行は復元せず、違反として残す（捏造しない）', async () => {
    const db = await makeDb();
    insertReviewWithoutEntity(db, 'rev-odd', 'sess-2#uuid-2', 'deadbeefdeadbeef');

    const result = unsafeRepairDanglingReferences({ db });
    expect(result.repairedReviewEntities).toBe(0);
    expect(result.unreconstructableReviewEntities).toBe(1);
    expect(db.exec(`SELECT COUNT(*) FROM caravan_entities`)[0].values[0][0]).toBe(0);
    expect(fkViolations(db)).toBe(1);
    db.close();
  });

  it('復元できないバグ修正リンクは NULL にし、行は残す', async () => {
    const db = await makeDb();
    insertBugFix(db, 'bugfix-dangling', 'no-such-episode');

    const result = unsafeRepairDanglingReferences({ db });

    expect(result.nulledBugFixLinks).toBe(1);
    expect(
      db.exec(`SELECT id, root_cause_episode_id FROM caravan_bug_fixes`)[0].values[0],
    ).toEqual(['bugfix-dangling', null]);
    expect(fkViolations(db)).toBe(0);
    db.close();
  });

  it('2 回目の実行は 0 件（冪等）', async () => {
    const db = await makeDb();
    const ref = 'sess-1#uuid-1';
    insertReviewWithoutEntity(db, 'rev-ok', ref, entityId('Review', ref));
    insertBugFix(db, 'bugfix-dangling', 'no-such-episode');

    unsafeRepairDanglingReferences({ db });
    const second = unsafeRepairDanglingReferences({ db });

    expect(second.repairedReviewEntities).toBe(0);
    expect(second.nulledBugFixLinks).toBe(0);
    expect(second.missingReviewEntities).toBe(0);
    db.close();
  });
});
