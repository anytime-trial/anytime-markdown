/**
 * contentless FTS5 索引の作り直しを検査する。
 *
 * 論点は「削除が索引へ反映されるか」の 1 点。追加・更新は `runRagFtsRebuild` が
 * 現存行を入れ直すことで済むが、削除された行の rowid は索引に残り続ける。
 */

import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { rebuildContentlessFtsIndexes } from '../../src/maintenance/rebuildContentlessFts';

const TS = '2026-08-01T00:00:00.000Z';

async function makeCaravanDb(): Promise<BetterSqlite3CaravanDb> {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(db);
  return db;
}

function insertEntity(db: BetterSqlite3CaravanDb, id: string, name: string): void {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, aliases_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, '["alias-one"]', ?, ?, ?)`,
    [id, name, name, TS, TS, TS],
  );
}

function insertEpisode(db: BetterSqlite3CaravanDb, id: string, excerpt: string): void {
  db.run(
    `INSERT INTO caravan_episodes
       (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model,
        valid_from, recorded_at, raw_excerpt)
     VALUES (?, 'sess', ?, ?, 'claude_code', 'test', ?, ?, ?)`,
    [id, `${id}-s`, `${id}-e`, TS, TS, excerpt],
  );
}

function count(db: BetterSqlite3CaravanDb, table: string): number {
  return db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0] as number;
}

describe('rebuildContentlessFtsIndexes', () => {
  it('削除された行が索引から消え、残った行は検索できる', async () => {
    const db = await makeCaravanDb();
    insertEntity(db, 'ent-keep', 'keep-concept');
    insertEntity(db, 'ent-drop', 'drop-concept');
    insertEpisode(db, 'ep-keep', 'keep excerpt');
    insertEpisode(db, 'ep-drop', 'drop excerpt');
    rebuildContentlessFtsIndexes(db);
    expect(count(db, 'caravan_entities_fts')).toBe(2);
    expect(count(db, 'caravan_episodes_fts')).toBe(2);

    // 本体だけ削除する（contentless FTS はトリガを持たないので索引は古いまま）。
    db.run(`DELETE FROM caravan_entities WHERE id = 'ent-drop'`);
    db.run(`DELETE FROM caravan_episodes WHERE id = 'ep-drop'`);
    expect(count(db, 'caravan_entities_fts')).toBe(2);
    expect(count(db, 'caravan_episodes_fts')).toBe(2);

    const result = rebuildContentlessFtsIndexes(db);

    expect(result).toEqual({ entities: 1, episodes: 1 });
    expect(count(db, 'caravan_entities_fts')).toBe(1);
    expect(count(db, 'caravan_episodes_fts')).toBe(1);
    expect(
      db.exec(`SELECT COUNT(*) FROM caravan_entities_fts WHERE caravan_entities_fts MATCH 'drop'`)[0]
        .values[0][0],
    ).toBe(0);
    expect(
      db.exec(`SELECT COUNT(*) FROM caravan_episodes_fts WHERE caravan_episodes_fts MATCH 'keep'`)[0]
        .values[0][0],
    ).toBe(1);
    expect(db.pragma('integrity_check')).toBeDefined();
    db.close();
  });

  it('aliases_json の文字列要素が aliases_text として検索できる', async () => {
    const db = await makeCaravanDb();
    insertEntity(db, 'ent-1', 'some-concept');
    rebuildContentlessFtsIndexes(db);
    expect(
      db.exec(
        // ハイフンは FTS5 のクエリ構文で演算子扱いになるためフレーズとして引用する。
        `SELECT COUNT(*) FROM caravan_entities_fts WHERE caravan_entities_fts MATCH '"alias-one"'`,
      )[0].values[0][0],
    ).toBe(1);
    db.close();
  });
});
