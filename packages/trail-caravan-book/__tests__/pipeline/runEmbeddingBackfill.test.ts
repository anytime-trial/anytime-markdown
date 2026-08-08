import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runEmbeddingBackfill } from '../../src/pipeline/runEmbeddingBackfill';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import { encodeEmbedding } from '../../src/embedding/codec';
import { runMigrations } from '../../src/db/migrations/runner';

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

/**
 * 実マイグレーションでスキーマを作る。手書きの最小スキーマは実テーブルの列
 * （valid_until など）が抜けて、本番でだけ落ちる差分を作る。
 */
async function makeDb() {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const AT = '2026-01-01T00:00:00.000Z';

function insertEntity(db: BetterSqlite3MemoryDb, id: string, displayName: string, summary = '', embedding?: Float32Array) {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, summary, embedding,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?, ?, ?)`,
    [id, displayName, displayName, summary, embedding ? encodeEmbedding(embedding) : null, AT, AT, AT]
  );
}

function insertEpisode(db: BetterSqlite3MemoryDb, id: string, excerpt: string, summary = '') {
  db.run(
    `INSERT INTO caravan_episodes
       (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model,
        valid_from, recorded_at, raw_excerpt, summary)
     VALUES (?, 'sess-1', ?, ?, 'claude_code', 'test-model', ?, ?, ?, ?)`,
    [id, `${id}-start`, `${id}-end`, AT, AT, excerpt, summary]
  );
}

function insertSpecDoc(db: BetterSqlite3MemoryDb, id: string, title: string, summary = '') {
  db.run(
    `INSERT INTO caravan_spec_documents
       (id, rel_path, type, title, c4_scope_json, updated_at, source_hash, summary, recorded_at)
     VALUES (?, ?, 'spec', ?, '[]', ?, 'hash', ?, ?)`,
    [id, `${id}.ja.md`, title, AT, summary, AT]
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

    const rows = db.exec('SELECT id, embedding FROM caravan_entities ORDER BY id');
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

    // item_key はテーブル名で修飾する（id はテーブルをまたぐと衝突しうるため）
    const failed = db.exec("SELECT item_key FROM caravan_failed_items WHERE scope='embedding_backfill'");
    expect(failed[0].values.length).toBe(1);
    expect(failed[0].values[0][0]).toBe('entities:e1');
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
      `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
       VALUES ('embedding_backfill', 'entities:e1', '2026-05-12T00:00:00.000Z', 'embedding_failed', 'ollama_unreachable', 1),
              ('embedding_backfill', 'entities:e2', '2026-05-12T00:00:00.000Z', 'embedding_failed', 'ollama_unreachable', 1),
              ('conversation_incremental', 'e1', '2026-05-12T00:00:00.000Z', 'extraction_failed', '', 1)`,
      []
    );

    await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(1)) });

    const remaining = db.exec(
      "SELECT scope, item_key FROM caravan_failed_items ORDER BY scope, item_key"
    );
    expect(remaining[0].values).toEqual([['conversation_incremental', 'e1']]);
  });

  it('episode と spec_document の embedding も生成する', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript');
    insertEpisode(db, 'ep1', 'ユーザーの発話', '要約');
    insertSpecDoc(db, 'doc1', '設計書タイトル', '設計書の要約');

    const result = await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(7)) });

    expect(result.items_processed).toBe(3);
    expect(result.processed_by_target).toEqual({ entities: 1, episodes: 1, spec_documents: 1 });
    for (const table of ['caravan_entities', 'caravan_episodes', 'caravan_spec_documents']) {
      const rows = db.exec(`SELECT embedding FROM ${table}`);
      expect(rows[0].values[0][0]).not.toBeNull();
      expect((rows[0].values[0][0] as Uint8Array).byteLength).toBe(4096);
    }
  });

  it('episode の embed テキストは summary + raw_excerpt', async () => {
    const db = await makeDb();
    insertEpisode(db, 'ep1', 'マージして', 'develop へのマージ依頼');
    const prompts: string[] = [];
    await runEmbeddingBackfill({
      db,
      ollama: mockOllama((prompt) => { prompts.push(prompt); return makeVec(1); }),
    });
    expect(prompts).toEqual(['develop へのマージ依頼\nマージして']);
  });

  it('無効化済み entity は embedding を生成しない', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'Alive');
    insertEntity(db, 'e2', 'Removed');
    db.run("UPDATE caravan_entities SET valid_until = '2026-05-12T00:00:00.000Z' WHERE id = 'e2'");

    const result = await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(1)) });

    expect(result.processed_by_target.entities).toBe(1);
    const row = db.exec("SELECT embedding FROM caravan_entities WHERE id = 'e2'");
    expect(row[0].values[0][0]).toBeNull();
  });

  it('本文が空の行は対象から外す（失敗として数えない）', async () => {
    const db = await makeDb();
    insertEpisode(db, 'ep-blank', '   ');

    const result = await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(1)) });

    expect(result.items_processed).toBe(0);
    // 次回も空のままなので「失敗」に数えると status が恒久的に劣化する
    expect(result.items_failed).toBe(0);
    expect(result.status).toBe('success');
    const failed = db.exec("SELECT COUNT(*) FROM caravan_failed_items WHERE scope='embedding_backfill'");
    expect(failed[0].values[0][0]).toBe(0);
  });

  it('旧形式（テーブル修飾なし）の失敗記録を掃除する', async () => {
    const db = await makeDb();
    insertEntity(db, 'e1', 'TypeScript');
    db.run(
      `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
       VALUES ('embedding_backfill', 'legacy-id', '2026-05-12T00:00:00.000Z', 'embedding_failed', '', 1),
              ('conversation_incremental', 'other-id', '2026-05-12T00:00:00.000Z', 'extraction_failed', '', 1)`,
      []
    );

    await runEmbeddingBackfill({ db, ollama: mockOllama(() => makeVec(1)) });

    const remaining = db.exec('SELECT scope, item_key FROM caravan_failed_items ORDER BY scope');
    expect(remaining[0].values).toEqual([['conversation_incremental', 'other-id']]);
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
