import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runEmbeddingBackfill } from '../../src/pipeline/runEmbeddingBackfill';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import { encodeEmbedding } from '../../src/embedding/codec';

function makeVec(seed: number): Float32Array {
  const v = new Float32Array(1024);
  v.fill(seed / 100);
  return v;
}

function mockOllama(
  handler: (prompt: string) => Float32Array | 'fail' = () => makeVec(1)
): OllamaClient {
  return {
    generate: async () => ({ response: '' }),
    embeddings: async ({ prompt }) => {
      const result = handler(prompt);
      if (result === 'fail') throw new Error('ollama_unreachable');
      return { embedding: result };
    },
  };
}

async function makeDb() {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(`
    CREATE TABLE memory_entities (
      id             TEXT PRIMARY KEY,
      type           TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      display_name   TEXT NOT NULL,
      summary        TEXT NOT NULL DEFAULT '',
      embedding      BLOB,
      first_seen_at  TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      last_updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      recorded_at    TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      aliases_json   TEXT NOT NULL DEFAULT '[]',
      tags_json      TEXT NOT NULL DEFAULT '[]',
      attributes_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT
  `);
  db.run(`
    CREATE TABLE memory_failed_items (
      scope         TEXT NOT NULL,
      item_key      TEXT NOT NULL,
      failed_at     TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      reason        TEXT NOT NULL,
      detail        TEXT NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (scope, item_key)
    ) STRICT
  `);
  db.run(`
    CREATE TABLE memory_pipeline_runs (
      id                 TEXT PRIMARY KEY,
      scope              TEXT NOT NULL,
      status             TEXT NOT NULL,
      started_at         TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      finished_at        TEXT,
      duration_ms        INTEGER NOT NULL DEFAULT 0,
      items_processed    INTEGER NOT NULL DEFAULT 0,
      items_failed       INTEGER NOT NULL DEFAULT 0,
      entities_inserted  INTEGER NOT NULL DEFAULT 0,
      entities_updated   INTEGER NOT NULL DEFAULT 0,
      edges_inserted     INTEGER NOT NULL DEFAULT 0,
      edges_invalidated  INTEGER NOT NULL DEFAULT 0
    ) STRICT
  `);
  return db;
}

function insertEntity(db: BetterSqlite3MemoryDb, id: string, displayName: string, summary = '', embedding?: Float32Array) {
  db.run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, summary, embedding)
     VALUES (?, 'Concept', ?, ?, ?, ?)`,
    [id, displayName, displayName, summary, embedding ? encodeEmbedding(embedding) : null]
  );
}

describe('runEmbeddingBackfill', () => {
  it('NULL embedding の entity に embedding を付与する', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript', 'statically typed language');
    insertEntity(db, 'e2', 'React', 'UI library');

    const result = await runEmbeddingBackfill({
      db,
      ollama: mockOllama(() => makeVec(42)),
    });

    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(2);
    expect(result.items_failed).toBe(0);

    const rows = db.exec('SELECT id, embedding FROM memory_entities ORDER BY id');
    for (const row of rows[0].values) {
      expect(row[1]).not.toBeNull();
      expect((row[1] as Uint8Array).byteLength).toBe(4096);
    }
  });

  it('embedding が既にある entity はスキップする', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript', '', makeVec(1));
    insertEntity(db, 'e2', 'React');

    let callCount = 0;
    const result = await runEmbeddingBackfill({
      db,
      ollama: mockOllama(() => { callCount++; return makeVec(2); }),
    });

    expect(result.items_processed).toBe(1);
    expect(result.items_skipped).toBe(1);
    expect(callCount).toBe(1);
  });

  it('Ollama 失敗時は failed_items に記録してスキップし処理続行する', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript');
    insertEntity(db, 'e2', 'React');

    let call = 0;
    const result = await runEmbeddingBackfill({
      db,
      ollama: mockOllama(() => {
        call++;
        return call === 1 ? 'fail' : makeVec(1);
      }),
    });

    expect(result.items_failed).toBe(1);
    expect(result.items_processed).toBe(1);
    expect(result.status).toBe('partial');

    const failed = db.exec("SELECT item_key FROM memory_failed_items WHERE scope='embedding_backfill'");
    expect(failed[0].values.length).toBe(1);
    expect(failed[0].values[0][0]).toBe('e1');
  });

  it('entity が 0 件のとき items_processed=0 で success を返す', async () => {
    const db = await makeDb();
    const result = await runEmbeddingBackfill({ db, ollama: mockOllama() });
    expect(result.status).toBe('success');
    expect(result.items_processed).toBe(0);
    expect(result.items_skipped).toBe(0);
  });

  it('成功時に同 entity の過去 failed_items 記録を削除する', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript');
    insertEntity(db, 'e2', 'React');
    db.run(
      `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
       VALUES ('embedding_backfill', 'e1', '2026-05-12T00:00:00.000Z', 'embedding_failed', 'ollama_unreachable', 1),
              ('embedding_backfill', 'e2', '2026-05-12T00:00:00.000Z', 'embedding_failed', 'ollama_unreachable', 1),
              ('conversation_incremental', 'e1', '2026-05-12T00:00:00.000Z', 'extraction_failed', '', 1)`,
      []
    );

    await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(1)) });

    const remaining = db.exec(
      "SELECT scope, item_key FROM memory_failed_items ORDER BY scope, item_key"
    );
    expect(remaining[0].values).toEqual([['conversation_incremental', 'e1']]);
  });

  it('embed テキストは type + display_name + summary で構成される', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TrailDatabase', 'VS Code 拡張の DB クラス');

    const prompts: string[] = [];
    await runEmbeddingBackfill({
      db,
      ollama: mockOllama((p) => { prompts.push(p); return makeVec(1); }),
    });

    expect(prompts[0]).toContain('TrailDatabase');
    expect(prompts[0]).toContain('VS Code 拡張の DB クラス');
  });
});
