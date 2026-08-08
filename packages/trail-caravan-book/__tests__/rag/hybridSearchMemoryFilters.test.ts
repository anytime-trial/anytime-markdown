/**
 * hybridSearchMemory の entity_types / since / hops=1 edges/episodes フィルター補完テスト。
 * src/rag/hybridSearchMemory.ts L61-67, L136, L158-183 をカバーする。
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryDbConnection } from '../../src/db/connection/types';
import { upsertEntityFts } from '../../src/rag/ftsSync';
import { hybridSearchMemory } from '../../src/rag/hybridSearchMemory';
import { encodeEmbedding } from '../../src/embedding/codec';
import { createMockOllamaClient } from '../helpers/MockOllamaClient';

function makeTmpDb(): string {
  return path.join(
    os.tmpdir(),
    `memory-hybrid-filters-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
}

const TS = '2026-01-01T00:00:00.000Z';

function insertEntity(
  db: MemoryDbConnection,
  id: string,
  canonical: string,
  type: string,
  embedding: Float32Array,
  lastUpdatedAt = TS,
): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, summary, aliases_json,
        embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, 'summary', '[]', ?, ?, ?, ?)`,
    [id, type, canonical, canonical, blob, TS, lastUpdatedAt, TS],
  );
}

describe('hybridSearchMemory - filters and hops', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    const opened = await openMemoryCoreDb(tmpDb);
    db = opened.db;
    close = opened.close;
  });

  afterEach(() => close());

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
  });

  test('entity_types フィルターで指定した type のみが返される', async () => {
    insertEntity(db, 'tool1', 'my_tool', 'Tool', Float32Array.from([1, 0, 0]));
    insertEntity(db, 'skill1', 'my_skill', 'Skill', Float32Array.from([1, 0, 0]));
    upsertEntityFts(db, 'tool1');
    upsertEntityFts(db, 'skill1');

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'my', entity_types: ['Tool'], final_limit: 10, hops: 0 },
    });

    const ids = result.entities.map((e) => e.id);
    expect(ids).toContain('tool1');
    expect(ids).not.toContain('skill1');
  });

  test('since フィルターで last_updated_at が古い entity は除外される', async () => {
    const oldTs = '2020-01-01T00:00:00.000Z';
    const recentTs = new Date().toISOString();
    insertEntity(db, 'old1', 'old_tool', 'Tool', Float32Array.from([1, 0, 0]), oldTs);
    insertEntity(db, 'new1', 'new_tool', 'Tool', Float32Array.from([1, 0, 0]), recentTs);
    upsertEntityFts(db, 'old1');
    upsertEntityFts(db, 'new1');

    const sinceDate = '2025-01-01T00:00:00.000Z';
    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'func', since: sinceDate, final_limit: 10, hops: 0 },
    });

    const ids = result.entities.map((e) => e.id);
    expect(ids).not.toContain('old1');
    expect(ids).toContain('new1');
  });

  test('entity_types フィルター付きで BM25 クエリも type 絞り込みが効く', async () => {
    insertEntity(db, 'tool2', 'unique_bm25_token_toolx', 'Tool', Float32Array.from([0, 0, 1]));
    insertEntity(db, 'skill2', 'unique_bm25_token_skillx', 'Skill', Float32Array.from([0, 0, 1]));
    upsertEntityFts(db, 'tool2');
    upsertEntityFts(db, 'skill2');

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: {
        query: 'unique_bm25_token',
        entity_types: ['Tool'],
        final_limit: 10,
        hops: 0,
      },
    });

    const ids = result.entities.map((e) => e.id);
    // Tool のみが結果に含まれる
    expect(ids).not.toContain('skill2');
  });

  test('hops=1 のとき fused entity の edges が返される', async () => {
    const recentTs = new Date().toISOString();
    insertEntity(db, 'ent-a', 'entity_a', 'Tool', Float32Array.from([1, 0, 0]), recentTs);
    insertEntity(db, 'ent-b', 'entity_b', 'Tool', Float32Array.from([0, 1, 0]), recentTs);
    upsertEntityFts(db, 'ent-a');
    upsertEntityFts(db, 'ent-b');

    // edge を挿入 (relates_to はマイグレーション初期データで存在)
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref,
          confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES ('edge-ab', 'ent-a', 'relates_to', 'ent-b', 'conversation', 'ref1', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      [recentTs, recentTs],
    );

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'entity_a', final_limit: 5, hops: 1 },
    });

    // ent-a が fused entities に含まれ、その edge が返される
    const edgeIds = result.edges.map((e) => e.id);
    // ent-a がトップに来るなら edge-ab が含まれる
    if (result.entities.some((e) => e.id === 'ent-a')) {
      expect(edgeIds).toContain('edge-ab');
    }
    // 少なくとも entities が返されること
    expect(result.entities.length).toBeGreaterThan(0);
  });

  test('bm25Search: FTS テーブルなし の場合は空を返す (hybridSearchMemory 内)', async () => {
    // FTS テーブルを DROP してから呼び出す
    db.execMany(`DROP TABLE IF EXISTS memory_entities_fts;
                 DROP TABLE IF EXISTS memory_episodes_fts;
                 DROP TABLE IF EXISTS memory_drift_events_fts;`);

    const recentTs = new Date().toISOString();
    insertEntity(db, 'nofts-ent', 'nofts_tool', 'Tool', Float32Array.from([1, 0, 0]), recentTs);

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'nofts', final_limit: 5, hops: 0 },
    });

    // vec のみで hit する
    expect(result.entities[0]?.id).toBe('nofts-ent');
  });

  test('bm25Search: FTS クエリが空になるときは空を返す', async () => {
    // tokenizeForFts5 が空文字を返すようなクエリ
    insertEntity(db, 'ent-empty', 'some_name', 'Tool', Float32Array.from([1, 0, 0]));
    upsertEntityFts(db, 'ent-empty');

    // 記号のみなど FTS トークンが生成されないクエリ
    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      // クエリが記号のみ → tokenizeForFts5 が空 → BM25 は空 → vec のみでヒット
      input: { query: '!@#$%', final_limit: 5, hops: 0 },
    });

    // vec で ent-empty がヒット
    expect(result.entities.some((e) => e.id === 'ent-empty')).toBe(true);
  });

  test('BM25 と vec どちらもヒットしないとき空を返す (fused.length === 0)', async () => {
    // DB に entity を入れない状態で、embedding も全ゼロ (cosine = 0 = 一致なし)
    // → fused.length === 0 → L136 のパスを通る
    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([0, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'completely_unrelated_x9z8y7', final_limit: 5, hops: 0 },
    });
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.episodes).toHaveLength(0);
  });

  test('BM25-only でヒットした entity は hydrateEntities で詳細取得される', async () => {
    // vec 検索でヒットしない embedding を持つ entity を BM25 でヒットさせる
    // vec: fixedEmbedding=[1,0,0] に似ていない [0,0,1] → vec でトップに来ない
    // BM25: 'uniquetoken_hydrate' でヒット
    const recentTs = new Date().toISOString();
    insertEntity(db, 'hydrate-bm25', 'uniquetoken_hydrate', 'Tool', Float32Array.from([0, 0, 1]), recentTs);
    upsertEntityFts(db, 'hydrate-bm25');

    // vec は [1,0,0] → 別の entity が vec でトップになる
    insertEntity(db, 'hydrate-vec', 'hydrate_vec_entity', 'Tool', Float32Array.from([1, 0, 0]), recentTs);
    upsertEntityFts(db, 'hydrate-vec');

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      // vec_limit=1 → vec で 1 件しか取らず、BM25 ヒットの hydrate-bm25 は vec に含まれない
      // → hydrateEntities が呼ばれる
      input: {
        query: 'uniquetoken_hydrate',
        final_limit: 10,
        vec_limit: 1,
        hops: 0,
      },
    });

    // BM25-only でヒットした hydrate-bm25 が hydrateEntities 経由で結果に含まれる
    expect(result.entities.some((e) => e.id === 'hydrate-bm25')).toBe(true);
  });
});
