/**
 * vectorTopK / searchMemory の embedding エラーパス補完テスト。
 * src/retrieve/searchMemory.ts L108 (decode error), L114 (cosine mismatch)
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

function makeMockOllama(embedding: Float32Array): OllamaClient {
  return {
    embeddings: jest.fn().mockResolvedValue({ embedding }),
    generate: jest.fn(),
  };
}

describe('vectorTopK - embedding error paths', () => {
  it('corrupted blob (byteLength % 4 !== 0) の entity はスキップされる', async () => {
    const db = makeDb();

    // 通常の entity
    const goodBlob = encodeEmbedding(Float32Array.from([1, 0, 0]));
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
       VALUES ('good', 'Tool', 'good', 'Good', '[]', '[]', '{}', 'good entity', ?, ?, ?, ?)`,
      [goodBlob, now, now, now],
    );

    // 壊れた blob (3 bytes → 4 の倍数でない → decodeEmbedding throws)
    const corruptedBlob = Buffer.from([0x01, 0x02, 0x03]); // 3 bytes
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
       VALUES ('corrupt', 'Tool', 'corrupt', 'Corrupt', '[]', '[]', '{}', 'corrupt entity', ?, ?, ?, ?)`,
      [corruptedBlob, now, now, now],
    );

    const ollama = makeMockOllama(Float32Array.from([1, 0, 0]));
    const result = await searchMemory({
      db,
      ollama,
      input: { query: 'query', hops: 0, limit: 10 },
    });

    // 壊れた entity はスキップされ、正常な entity のみ返る
    expect(result.entities.some((e) => e.id === 'good')).toBe(true);
    expect(result.entities.some((e) => e.id === 'corrupt')).toBe(false);

    db.close();
  });

  it('次元が異なる entity (cosine dimension mismatch) はスキップされる', async () => {
    const db = makeDb();

    // query は 3 次元、entity は 4 次元 → cosineSimilarity が throw
    const dim4Blob = encodeEmbedding(Float32Array.from([1, 0, 0, 0])); // 4 次元
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, embedding, first_seen_at, last_updated_at, recorded_at)
       VALUES ('dim4', 'Tool', 'dim4', 'Dim4', '[]', '[]', '{}', 'dim4 entity', ?, ?, ?, ?)`,
      [dim4Blob, now, now, now],
    );

    // query が 3 次元
    const ollama = makeMockOllama(Float32Array.from([1, 0, 0])); // 3 次元
    const result = await searchMemory({
      db,
      ollama,
      input: { query: 'query', hops: 0, limit: 10 },
    });

    // 次元が合わない entity はスキップされる
    expect(result.entities.some((e) => e.id === 'dim4')).toBe(false);

    db.close();
  });

  it('embedding が NULL の entity はスキップされる', async () => {
    const db = makeDb();

    // embedding = NULL
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json, summary, first_seen_at, last_updated_at, recorded_at)
       VALUES ('no-emb', 'Tool', 'no-emb', 'NoEmb', '[]', '[]', '{}', 'no embedding', ?, ?, ?)`,
      [now, now, now],
    );

    const ollama = makeMockOllama(Float32Array.from([1, 0, 0]));
    const result = await searchMemory({
      db,
      ollama,
      input: { query: 'query', hops: 0, limit: 10 },
    });

    // embedding なしはスキップ
    expect(result.entities.some((e) => e.id === 'no-emb')).toBe(false);

    db.close();
  });
});
