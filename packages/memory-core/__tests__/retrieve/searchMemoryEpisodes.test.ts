/**
 * searchMemory の episodes 取得・cap/deduplicate ロジックの補完テスト。
 * src/retrieve/searchMemory.ts L188-205 を対象にする。
 */
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { searchMemory } from '../../src/retrieve/searchMemory';
import { encodeEmbedding } from '../../src/embedding/codec';
import type { OllamaClient } from '@anytime-markdown/agent-core';

const now = new Date().toISOString();

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertEntity(db: BetterSqlite3MemoryDb, id: string, embedding: Float32Array): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Tool', ?, ?, '[]', '[]', '{}', 'summary', ?, ?, ?, ?)`,
    [id, id, id, blob, now, now, now],
  );
}

function insertEpisode(
  db: BetterSqlite3MemoryDb,
  episodeId: string,
  sessionId: string,
  validFrom: string,
  excerpt: string,
): void {
  db.run(
    `INSERT INTO memory_episodes (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model, valid_from, raw_excerpt, recorded_at)
     VALUES (?, ?, ?, ?, 'claude_code', 'claude', ?, ?, ?)`,
    [episodeId, sessionId, `msg-start-${episodeId}`, `msg-end-${episodeId}`, validFrom, excerpt, now],
  );
}

function linkEpisodeToEntity(
  db: BetterSqlite3MemoryDb,
  episodeId: string,
  entityId: string,
): void {
  db.run(
    `INSERT INTO memory_episode_entities (episode_id, entity_id)
     VALUES (?, ?)`,
    [episodeId, entityId],
  );
}

describe('searchMemory - episodes cap and deduplication', () => {
  let db: BetterSqlite3MemoryDb;
  let mockOllama: OllamaClient;

  beforeEach(() => {
    db = makeDb();
    // Insert 1 entity with embedding matching query
    insertEntity(db, 'ent1', Float32Array.from([1, 0, 0]));
    mockOllama = {
      embeddings: jest.fn().mockResolvedValue({ embedding: Float32Array.from([1, 0, 0]) }),
      generate: jest.fn(),
    };
  });

  afterEach(() => {
    db.close();
  });

  it('エピソード 4 件以上でも 1 entity あたり最大 3 件に制限される', async () => {
    const times = [
      '2026-01-04T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ];
    for (let i = 0; i < 4; i++) {
      insertEpisode(db, `ep${i}`, 'sess1', times[i], `excerpt ${i}`);
      linkEpisodeToEntity(db, `ep${i}`, 'ent1');
    }

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'ent1', hops: 1, limit: 5 },
    });

    // ent1 に関連する episodes は最大 3 件
    expect(result.episodes.length).toBeLessThanOrEqual(3);
  });

  it('複数 entity が同じ episode を共有しても重複して返さない', async () => {
    insertEntity(db, 'ent2', Float32Array.from([0.99, 0, 0]));
    // 1つの episode を ent1 と ent2 両方にリンク
    insertEpisode(db, 'shared-ep', 'sess-shared', '2026-01-01T00:00:00.000Z', 'shared excerpt');
    linkEpisodeToEntity(db, 'shared-ep', 'ent1');
    linkEpisodeToEntity(db, 'shared-ep', 'ent2');

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'query', hops: 1, limit: 5 },
    });

    // shared-ep は episodes 配列に 1 回だけ含まれる
    const epIds = result.episodes.map((e) => e.id);
    const uniqueIds = new Set(epIds);
    expect(uniqueIds.size).toBe(epIds.length);
    expect(epIds.filter((id) => id === 'shared-ep').length).toBeLessThanOrEqual(1);
  });

  it('episode の raw_excerpt が結果に含まれる', async () => {
    insertEpisode(db, 'ep-content', 'sess3', now, 'The actual content here');
    linkEpisodeToEntity(db, 'ep-content', 'ent1');

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'ent1', hops: 1, limit: 5 },
    });

    const ep = result.episodes.find((e) => e.id === 'ep-content');
    expect(ep).toBeDefined();
    expect(ep?.raw_excerpt).toBe('The actual content here');
    expect(ep?.session_id).toBe('sess3');
  });

  it('hops=0 のとき episodes は空', async () => {
    insertEpisode(db, 'ep-hop0', 'sess4', now, 'should not appear');
    linkEpisodeToEntity(db, 'ep-hop0', 'ent1');

    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'ent1', hops: 0, limit: 5 },
    });

    expect(result.episodes).toHaveLength(0);
  });

  it('since フィルターで古い entity は除外される', async () => {
    // ent1 は last_updated_at = now なので since=未来日時で除外される
    const futureDate = new Date(Date.now() + 86400_000).toISOString();
    const result = await searchMemory({
      db,
      ollama: mockOllama,
      input: { query: 'query', hops: 0, limit: 5, since: futureDate },
    });

    // 未来の since → ent1 は last_updated_at < since なので除外される
    expect(result.entities.some((e) => e.id === 'ent1')).toBe(false);
  });
});
