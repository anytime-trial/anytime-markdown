/**
 * 他ワークスペース由来の記憶の「数える」「削除する」を検査する。
 *
 * 削除は永続データの破棄なので、数える関数が書き込まないこと・判定不能な行を
 * 巻き添えにしないことを、削除そのものと同じ重みで確かめる。
 */

import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import {
  countForeignWorkspaceMemory,
  unsafePurgeForeignWorkspaceMemory,
} from '../../src/maintenance/purgeForeignWorkspaceMemory';
import { allWorkspacesScope, ownWorkspaceScope } from '../../src/ingest/workspaceScope';

const TS = '2026-08-01T00:00:00.000Z';
const OWN = 'anytime-markdown';
const FOREIGN = 'anytime-trade';

function makeTrailDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE
  ) STRICT`);
  db.run(`CREATE TABLE activity_sessions (
    id TEXT PRIMARY KEY,
    repo_id INTEGER REFERENCES activity_repos(repo_id) ON DELETE CASCADE
  ) STRICT`);
  return db;
}

function insertSession(db: BetterSqlite3CaravanDb, sid: string, repoName: string): void {
  db.run(`INSERT OR IGNORE INTO activity_repos (repo_name) VALUES (?)`, [repoName]);
  const repoId = db.exec(`SELECT repo_id FROM activity_repos WHERE repo_name = ?`, [repoName])[0]
    .values[0][0] as number;
  db.run(`INSERT INTO activity_sessions (id, repo_id) VALUES (?, ?)`, [sid, repoId]);
}

async function makeCaravanDb(): Promise<BetterSqlite3CaravanDb> {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(db);
  return db;
}

function insertEpisode(db: BetterSqlite3CaravanDb, id: string, sessionId: string): void {
  db.run(
    `INSERT INTO caravan_episodes
       (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model,
        valid_from, recorded_at, raw_excerpt)
     VALUES (?, ?, ?, ?, 'claude_code', 'test', ?, ?, 'excerpt')`,
    [id, sessionId, `${id}-start`, `${id}-end`, TS, TS],
  );
}

function insertEntity(db: BetterSqlite3CaravanDb, id: string, name: string): void {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, name, name, TS, TS, TS],
  );
}

function insertConversationEdge(
  db: BetterSqlite3CaravanDb,
  id: string,
  entityId: string,
  episodeId: string,
): void {
  db.run(
    `INSERT INTO caravan_edges
       (id, subject_entity_id, predicate, object_literal, valid_from, recorded_at,
        source_type, source_ref)
     VALUES (?, ?, 'relates_to', 'literal', ?, ?, 'conversation', ?)`,
    [id, entityId, TS, TS, episodeId],
  );
}

function insertSessionReview(db: BetterSqlite3CaravanDb, id: string, workspace: string): void {
  insertEntity(db, `${id}-entity`, `review-${id}`);
  db.run(
    `INSERT INTO caravan_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title,
        reviewed_at, recorded_at, workspace)
     VALUES (?, 'session', ?, ?, 'code', 'title', ?, ?, ?)`,
    [id, `ref-${id}`, `${id}-entity`, TS, TS, workspace],
  );
  db.run(
    `INSERT INTO caravan_review_findings
       (id, review_id, finding_entity_id, finding_index, finding_text, recorded_at)
     VALUES (?, ?, ?, 0, 'finding', ?)`,
    [`${id}-f0`, id, `${id}-entity`, TS],
  );
}

async function makeFixture(): Promise<{
  memDb: BetterSqlite3CaravanDb;
  trailDb: BetterSqlite3CaravanDb;
}> {
  const memDb = await makeCaravanDb();
  const trailDb = makeTrailDb();
  insertSession(trailDb, 'sess-own', OWN);
  insertSession(trailDb, 'sess-foreign', FOREIGN);
  attachTrailDbFromHandle(memDb, trailDb);

  insertEpisode(memDb, 'ep-own', 'sess-own');
  insertEpisode(memDb, 'ep-foreign', 'sess-foreign');
  // activity.db に対応セッションが無いエピソード（判定不能）
  insertEpisode(memDb, 'ep-unknown', 'sess-pruned');

  insertEntity(memDb, 'ent-1', 'shared-concept');
  insertConversationEdge(memDb, 'edge-own', 'ent-1', 'ep-own');
  insertConversationEdge(memDb, 'edge-foreign', 'ent-1', 'ep-foreign');
  insertConversationEdge(memDb, 'edge-unknown', 'ent-1', 'ep-unknown');
  memDb.run(`INSERT INTO caravan_episode_entities (episode_id, entity_id) VALUES (?, ?)`, [
    'ep-foreign',
    'ent-1',
  ]);

  insertSessionReview(memDb, 'rev-own', OWN);
  insertSessionReview(memDb, 'rev-foreign', FOREIGN);
  return { memDb, trailDb };
}

function tableIds(db: BetterSqlite3CaravanDb, sql: string): string[] {
  return (db.exec(sql)[0]?.values ?? []).map((r) => r[0] as string).sort();
}

describe('countForeignWorkspaceMemory', () => {
  it('他ワークスペース由来の行だけを数え、判定不能な行は別枠にする', async () => {
    const { memDb, trailDb } = await makeFixture();
    const counts = countForeignWorkspaceMemory({ db: memDb, scope: ownWorkspaceScope(OWN) });
    expect(counts).toEqual({
      episodes: 1,
      edges: 1,
      episodeEntities: 1,
      reviews: 1,
      reviewFindings: 1,
      unresolvedEpisodes: 1,
    });
    trailDb.close();
    memDb.close();
  });

  it('数えるだけで 1 行も消さない', async () => {
    const { memDb, trailDb } = await makeFixture();
    countForeignWorkspaceMemory({ db: memDb, scope: ownWorkspaceScope(OWN) });
    expect(tableIds(memDb, `SELECT id FROM caravan_episodes`)).toEqual([
      'ep-foreign',
      'ep-own',
      'ep-unknown',
    ]);
    expect(tableIds(memDb, `SELECT id FROM caravan_reviews`)).toEqual(['rev-foreign', 'rev-own']);
    trailDb.close();
    memDb.close();
  });

  it('scope=all では対象 0 件（限定していないので消すものが無い）', async () => {
    const { memDb, trailDb } = await makeFixture();
    const counts = countForeignWorkspaceMemory({ db: memDb, scope: allWorkspacesScope() });
    expect(counts.episodes).toBe(0);
    expect(counts.reviews).toBe(0);
    trailDb.close();
    memDb.close();
  });
});

describe('unsafePurgeForeignWorkspaceMemory', () => {
  it('他ワークスペース由来だけを消し、自ワークスペースと判定不能は残す', async () => {
    const { memDb, trailDb } = await makeFixture();
    const deleted = unsafePurgeForeignWorkspaceMemory({ db: memDb, scope: ownWorkspaceScope(OWN) });

    expect(deleted.episodes).toBe(1);
    expect(deleted.edges).toBe(1);
    expect(deleted.episodeEntities).toBe(1);
    expect(deleted.reviews).toBe(1);
    expect(deleted.reviewFindings).toBe(1);

    expect(tableIds(memDb, `SELECT id FROM caravan_episodes`)).toEqual(['ep-own', 'ep-unknown']);
    expect(tableIds(memDb, `SELECT id FROM caravan_edges`)).toEqual(['edge-own', 'edge-unknown']);
    expect(tableIds(memDb, `SELECT id FROM caravan_reviews`)).toEqual(['rev-own']);
    expect(tableIds(memDb, `SELECT id FROM caravan_review_findings`)).toEqual(['rev-own-f0']);

    // エンティティは共有ノードなので消さない（他ソースの参照を壊さないため）。
    expect(tableIds(memDb, `SELECT id FROM caravan_entities WHERE id = 'ent-1'`)).toEqual(['ent-1']);

    trailDb.close();
    memDb.close();
  });

  it('2 回目の実行は 0 件（冪等）', async () => {
    const { memDb, trailDb } = await makeFixture();
    unsafePurgeForeignWorkspaceMemory({ db: memDb, scope: ownWorkspaceScope(OWN) });
    const second = unsafePurgeForeignWorkspaceMemory({ db: memDb, scope: ownWorkspaceScope(OWN) });
    expect(second.episodes).toBe(0);
    expect(second.edges).toBe(0);
    expect(second.reviews).toBe(0);
    trailDb.close();
    memDb.close();
  });

  it('scope=all では 1 行も消さない', async () => {
    const { memDb, trailDb } = await makeFixture();
    const deleted = unsafePurgeForeignWorkspaceMemory({ db: memDb, scope: allWorkspacesScope() });
    expect(deleted.episodes).toBe(0);
    expect(tableIds(memDb, `SELECT id FROM caravan_episodes`)).toEqual([
      'ep-foreign',
      'ep-own',
      'ep-unknown',
    ]);
    trailDb.close();
    memDb.close();
  });
});
