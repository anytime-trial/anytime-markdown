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
    `memory-hybrid-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
}

const TS = '2026-01-01T00:00:00.000Z';

function insertEntity(
  db: MemoryDbConnection,
  id: string,
  canonical: string,
  display: string,
  summary: string,
  embedding: Float32Array,
): void {
  const blob = encodeEmbedding(embedding);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, summary, aliases_json,
        embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Function', ?, ?, ?, '[]', ?, ?, ?, ?)`,
    [id, canonical, display, summary, blob, TS, TS, TS],
  );
}

describe('hybridSearchMemory', () => {
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

  test('BM25 と vec の両方で hit する entity がトップに来る', async () => {
    insertEntity(
      db,
      'e1',
      'search_memory',
      'searchMemory',
      'BM25 + vec で検索する関数',
      Float32Array.from([1, 0, 0]),
    );
    insertEntity(
      db,
      'e2',
      'other_fn',
      'otherFn',
      '無関係な関数',
      Float32Array.from([0, 1, 0]),
    );
    upsertEntityFts(db, 'e1');
    upsertEntityFts(db, 'e2');

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'searchMemory', final_limit: 5, hops: 0 },
    });

    expect(result.entities[0]?.id).toBe('e1');
  });

  test('BM25 のみ hit する entity も結果に含まれる (vec で hit しない場合)', async () => {
    insertEntity(
      db,
      'e1',
      'name_unique_token',
      'someUniqueToken',
      'summary',
      Float32Array.from([0, 0, 1]),
    );
    insertEntity(
      db,
      'e2',
      'other',
      'other',
      'summary',
      Float32Array.from([1, 0, 0]),
    );
    upsertEntityFts(db, 'e1');
    upsertEntityFts(db, 'e2');

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'someUniqueToken', final_limit: 5, hops: 0 },
    });

    const ids = result.entities.map((e) => e.id);
    expect(ids).toContain('e1');
  });

  test('final_limit で件数が制限される', async () => {
    for (let i = 0; i < 20; i++) {
      insertEntity(
        db,
        `e${i}`,
        `n${i}`,
        `name${i}`,
        'common summary text',
        Float32Array.from([1, 0, 0]),
      );
      upsertEntityFts(db, `e${i}`);
    }
    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'common summary', final_limit: 3, hops: 0 },
    });
    expect(result.entities.length).toBeLessThanOrEqual(3);
  });

  test('FTS5 が利用不可な接続では vec のみで結果を返す', async () => {
    // FTS テーブルを DROP して FTS5 が利用不可な状況をシミュレート
    db.execMany(`DROP TABLE IF EXISTS memory_entities_fts;
                 DROP TABLE IF EXISTS memory_episodes_fts;
                 DROP TABLE IF EXISTS memory_drift_events_fts;`);

    insertEntity(db, 'e1', 'n1', 'name1', 'summary', Float32Array.from([1, 0, 0]));

    const ollama = createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) });
    const result = await hybridSearchMemory({
      db,
      ollama,
      input: { query: 'name1', final_limit: 5, hops: 0 },
    });

    expect(result.entities[0]?.id).toBe('e1');
  });
});
