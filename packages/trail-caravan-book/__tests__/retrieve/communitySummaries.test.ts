/**
 * Tests for src/retrieve/communitySummaries.ts (T-22)
 *
 * listCaravanCommunities / upsertCaravanCommunitySummaries / fetchCommunityNames の
 * サイズフィルタ・stable_key の再採番耐性・再関連付け・冪等 upsert を検証する。
 */
import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  listCaravanCommunities,
  upsertCaravanCommunitySummaries,
  fetchCommunityNames,
} from '../../src/retrieve/communitySummaries';

const TS = '2026-08-09T09:00:00.000Z';

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertEntity(db: BetterSqlite3CaravanDb, id: string, displayName: string, type = 'Concept'): void {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [id, type, displayName.toLowerCase(), displayName, TS, TS, TS],
  );
}

function insertLayout(
  db: BetterSqlite3CaravanDb,
  entityId: string,
  communityId: number,
  graphVersion: string,
  opts: { degree?: number; recordedAt?: string } = {},
): void {
  db.run(
    `INSERT INTO caravan_entity_layout (entity_id, x, y, community_id, degree, graph_version, recorded_at)
     VALUES (?, 0, 0, ?, ?, ?, ?)`,
    [entityId, communityId, opts.degree ?? 0, graphVersion, opts.recordedAt ?? TS],
  );
}

/** minSize 件のメンバーを持つコミュニティを 1 つ作る */
function seedCommunity(
  db: BetterSqlite3CaravanDb,
  communityId: number,
  graphVersion: string,
  memberNames: string[],
  idPrefix = `e${communityId}`,
): string[] {
  const ids = memberNames.map((name, i) => `${idPrefix}x${i}${name.length}`.padEnd(16, '0'));
  ids.forEach((id, i) => {
    insertEntity(db, id, memberNames[i]);
    insertLayout(db, id, communityId, graphVersion, { degree: memberNames.length - i });
  });
  return ids;
}

const NAMES_A = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
const NAMES_B = ['lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon'];

describe('listCaravanCommunities', () => {
  test('filters by minSize and reports member_count', () => {
    const db = makeDb();
    try {
      seedCommunity(db, 1, 'v1', NAMES_A); // size 10
      seedCommunity(db, 2, 'v1', ['solo1', 'solo2']); // size 2
      const communities = listCaravanCommunities(db, { minSize: 10 });
      expect(communities.length).toBe(1);
      expect(communities[0].community_id).toBe(1);
      expect(communities[0].member_count).toBe(10);
      expect(communities[0].graph_version).toBe('v1');
      expect(communities[0].stable_key).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      db.close();
    }
  });

  test('stable_key is invariant under community_id renumbering', () => {
    const db1 = makeDb();
    const db2 = makeDb();
    try {
      seedCommunity(db1, 1, 'v1', NAMES_A, 'same');
      seedCommunity(db2, 42, 'v9', NAMES_A, 'same'); // 同じメンバー集合（同一 ID）・別番号・別版
      const key1 = listCaravanCommunities(db1, { minSize: 10 })[0].stable_key;
      const key2 = listCaravanCommunities(db2, { minSize: 10 })[0].stable_key;
      expect(key1).toBe(key2);
    } finally {
      db1.close();
      db2.close();
    }
  });

  test('sample_members are ordered by degree desc and exclude low-information names', () => {
    const db = makeDb();
    try {
      const names = [...NAMES_A.slice(0, 9), '不明のバグ'];
      const ids = seedCommunity(db, 1, 'v1', names);
      // 低情報名に最高次数を与えても標本から除外される
      db.run(`UPDATE caravan_entity_layout SET degree = 99 WHERE entity_id = ?`, [ids[9]]);
      const [community] = listCaravanCommunities(db, { minSize: 10, sampleSize: 3 });
      expect(community.sample_members.length).toBe(3);
      expect(community.sample_members[0].display_name).toBe('alpha'); // degree 10
      expect(community.sample_members.map((m) => m.display_name)).not.toContain('不明のバグ');
    } finally {
      db.close();
    }
  });

  test('unsummarizedOnly excludes communities that already have a summary', () => {
    const db = makeDb();
    try {
      seedCommunity(db, 1, 'v1', NAMES_A);
      seedCommunity(db, 2, 'v1', NAMES_B);
      const [c1] = listCaravanCommunities(db, { minSize: 10 });
      upsertCaravanCommunitySummaries(db, [{ stable_key: c1.stable_key, name: 'A 群', summary: 'テスト' }]);
      const remaining = listCaravanCommunities(db, { minSize: 10, unsummarizedOnly: true });
      expect(remaining.length).toBe(1);
      expect(remaining[0].community_id).toBe(2);
    } finally {
      db.close();
    }
  });

  test('re-associates summaries after layout regeneration (renumbered community_id)', () => {
    const db = makeDb();
    try {
      seedCommunity(db, 1, 'v1', NAMES_A);
      const [before] = listCaravanCommunities(db, { minSize: 10 });
      upsertCaravanCommunitySummaries(db, [{ stable_key: before.stable_key, name: 'A 群', summary: 'テスト' }]);

      // layout 洗い替え: 同じメンバー集合が別番号・別版で再登場
      db.run(`DELETE FROM caravan_entity_layout`);
      NAMES_A.forEach((name, i) => {
        const id = `e1x${i}${name.length}`.padEnd(16, '0');
        insertLayout(db, id, 7, 'v2', { degree: 10 - i, recordedAt: '2026-08-09T10:00:00.000Z' });
      });

      const after = listCaravanCommunities(db, { minSize: 10 });
      expect(after.length).toBe(1);
      expect(after[0].name).toBe('A 群'); // stable_key 経由で引き継がれる
      // 再関連付けで summaries 行の版・番号が現行へ更新される
      const row = db.exec(`SELECT graph_version, community_id FROM caravan_community_summaries`)[0];
      expect(row?.values[0][0]).toBe('v2');
      expect(row?.values[0][1]).toBe(7);
    } finally {
      db.close();
    }
  });
});

describe('upsertCaravanCommunitySummaries', () => {
  test('is idempotent and updates name/summary on re-upsert', () => {
    const db = makeDb();
    try {
      seedCommunity(db, 1, 'v1', NAMES_A);
      const [c] = listCaravanCommunities(db, { minSize: 10 });
      const r1 = upsertCaravanCommunitySummaries(db, [{ stable_key: c.stable_key, name: '旧名', summary: '旧' }]);
      const r2 = upsertCaravanCommunitySummaries(db, [{ stable_key: c.stable_key, name: '新名', summary: '新' }]);
      expect(r1.upserted).toBe(1);
      expect(r2.upserted).toBe(1);
      const rows = db.exec(`SELECT name, summary FROM caravan_community_summaries`)[0];
      expect(rows?.values.length).toBe(1);
      expect(rows?.values[0][0]).toBe('新名');
    } finally {
      db.close();
    }
  });

  test('skips stable_keys not present in the current layout and reports them', () => {
    const db = makeDb();
    try {
      seedCommunity(db, 1, 'v1', NAMES_A);
      const result = upsertCaravanCommunitySummaries(db, [
        { stable_key: 'ffffffffffffffff', name: '幽霊', summary: '現行版に存在しない' },
      ]);
      expect(result.upserted).toBe(0);
      expect(result.skipped_stable_keys).toEqual(['ffffffffffffffff']);
      expect(db.exec(`SELECT COUNT(*) FROM caravan_community_summaries`)[0]?.values[0][0]).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('fetchCommunityNames', () => {
  test('returns names only for entities whose community is summarized in the current version', () => {
    const db = makeDb();
    try {
      const idsA = seedCommunity(db, 1, 'v1', NAMES_A);
      const idsB = seedCommunity(db, 2, 'v1', NAMES_B);
      const [c1] = listCaravanCommunities(db, { minSize: 10 });
      upsertCaravanCommunitySummaries(db, [{ stable_key: c1.stable_key, name: 'A 群', summary: '' }]);
      const map = fetchCommunityNames(db, [idsA[0], idsB[0], 'nonexistent0000']);
      expect(map.get(idsA[0])).toBe('A 群');
      expect(map.has(idsB[0])).toBe(false);
      expect(map.has('nonexistent0000')).toBe(false);
    } finally {
      db.close();
    }
  });

  test('returns empty map when the summaries table is absent (pre-migration DB)', () => {
    const db = makeDb();
    try {
      db.run(`DROP TABLE caravan_community_summaries`);
      expect(fetchCommunityNames(db, ['x']).size).toBe(0);
    } finally {
      db.close();
    }
  });
});
