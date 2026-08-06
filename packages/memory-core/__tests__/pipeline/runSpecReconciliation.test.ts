import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { runSpecReconciliation } from '../../src/pipeline/runSpecReconciliation';

const AT = '2026-05-12T00:00:00.000Z';
const NOW = '2026-05-12T01:00:00.000Z';

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.run(
    `INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description)
     VALUES ('must', 'multiple_active', 'subject_to_object', 'test')`,
  );
  return db;
}

function insertEntity(db: BetterSqlite3MemoryDb, id: string, type: string, name: string): void {
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, name, name, AT, AT, AT],
  );
}

function insertSpecDoc(db: BetterSqlite3MemoryDb, docId: string, relPath: string, entityId: string): void {
  db.run(
    `INSERT INTO memory_spec_documents
       (id, rel_path, type, title, c4_scope_json, updated_at, source_hash, summary, recorded_at)
     VALUES (?, ?, 'spec', ?, '[]', ?, 'hash', '', ?)`,
    [docId, relPath, relPath, AT, AT],
  );
  insertEntity(db, entityId, 'Concept', relPath);
  db.run(
    `INSERT INTO memory_spec_doc_entities (spec_doc_id, entity_id, line_hint) VALUES (?, ?, NULL)`,
    [docId, entityId],
  );
}

function insertSpecEdge(
  db: BetterSqlite3MemoryDb,
  edgeId: string,
  docId: string,
  subjectId: string,
  objectId: string,
): void {
  db.run(
    `INSERT INTO memory_edges
       (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at,
        source_type, source_ref, confidence, confidence_label, modality, attributes_json)
     VALUES (?, ?, 'must', ?, ?, ?, 'spec', ?, 1.0, 'EXTRACTED', 'mandatory', '{}')`,
    [edgeId, subjectId, objectId, AT, AT, `spec_doc#${docId}`],
  );
}

function writeSpec(root: string, relPath: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '---\ntype: spec\n---\n本文\n', 'utf-8');
}

describe('runSpecReconciliation', () => {
  let specRoot: string;

  beforeEach(() => {
    specRoot = mkdtempSync(join(tmpdir(), 'spec-reconcile-'));
  });

  afterEach(() => {
    rmSync(specRoot, { recursive: true, force: true });
  });

  test('実在するドキュメントは削除も無効化もされない', () => {
    const db = makeDb();
    writeSpec(specRoot, '10.web/live.ja.md');
    insertSpecDoc(db, 'doc-live', '10.web/live.ja.md', 'ent-live');

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.status).toBe('success');
    expect(result.scanned).toBe(1);
    expect(result.removed_docs).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM memory_spec_documents').get()?.['n']).toBe(1);
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('ent-live')?.['valid_until']).toBeNull();

    db.close();
  });

  test('消えたドキュメントの行を削除し spec_doc entity を無効化する', () => {
    const db = makeDb();
    writeSpec(specRoot, '10.web/live.ja.md');
    insertSpecDoc(db, 'doc-live', '10.web/live.ja.md', 'ent-live');
    insertSpecDoc(db, 'doc-gone', '99.old/gone.ja.md', 'ent-gone');

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.removed_docs).toBe(1);
    expect(result.soft_deleted_doc_entities).toBe(1);

    const remaining = db.prepare('SELECT id FROM memory_spec_documents').all();
    expect(remaining.map((r) => r['id'])).toEqual(['doc-live']);

    // リンク行は ON DELETE CASCADE で消える
    expect(db.prepare('SELECT COUNT(*) n FROM memory_spec_doc_entities WHERE spec_doc_id = ?').get('doc-gone')?.['n']).toBe(0);

    // entity は残るが無効化される（履歴を消さない）
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('ent-gone')?.['valid_until']).toBe(NOW);
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('ent-live')?.['valid_until']).toBeNull();

    db.close();
  });

  test('消えたドキュメント由来の edge を閉じ、無効化を記録する', () => {
    const db = makeDb();
    writeSpec(specRoot, 'live.ja.md');
    insertSpecDoc(db, 'doc-live', 'live.ja.md', 'ent-live');
    insertSpecDoc(db, 'doc-gone', 'gone.ja.md', 'ent-gone');
    insertEntity(db, 'claim-a', 'Concept', 'claim-a');
    insertEntity(db, 'claim-b', 'Concept', 'claim-b');
    insertSpecEdge(db, 'edge-gone', 'doc-gone', 'claim-a', 'claim-b');
    insertSpecEdge(db, 'edge-live', 'doc-live', 'claim-a', 'claim-b');

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.invalidated_edges).toBe(1);
    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get('edge-gone')?.['valid_to']).toBe(NOW);
    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get('edge-live')?.['valid_to']).toBeNull();

    const inv = db.prepare('SELECT reason, detail FROM memory_edge_invalidations WHERE edge_id = ?').get('edge-gone');
    expect(inv?.['reason']).toBe('spec_updated');
    expect(String(inv?.['detail'])).toContain('gone.ja.md');

    db.close();
  });

  test('有効な edge を失った claim entity を孤立として無効化する', () => {
    const db = makeDb();
    writeSpec(specRoot, 'live.ja.md');
    insertSpecDoc(db, 'doc-live', 'live.ja.md', 'ent-live');
    insertSpecDoc(db, 'doc-gone', 'gone.ja.md', 'ent-gone');
    insertEntity(db, 'claim-orphan', 'Concept', 'claim-orphan');
    insertEntity(db, 'claim-kept', 'Concept', 'claim-kept');
    insertSpecEdge(db, 'edge-1', 'doc-gone', 'claim-orphan', 'claim-kept');
    // claim-kept は生存ドキュメント由来の edge も持つので残す
    insertSpecEdge(db, 'edge-2', 'doc-live', 'claim-kept', 'ent-live');

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.soft_deleted_orphan_entities).toBe(1);
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('claim-orphan')?.['valid_until']).toBe(NOW);
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('claim-kept')?.['valid_until']).toBeNull();

    db.close();
  });

  test('会話エピソードに紐づく entity は孤立扱いにしない', () => {
    const db = makeDb();
    writeSpec(specRoot, 'live.ja.md');
    insertSpecDoc(db, 'doc-live', 'live.ja.md', 'ent-live');
    insertSpecDoc(db, 'doc-gone', 'gone.ja.md', 'ent-gone');
    insertEntity(db, 'claim-known', 'Concept', 'claim-known');
    insertEntity(db, 'claim-other', 'Concept', 'claim-other');
    insertSpecEdge(db, 'edge-1', 'doc-gone', 'claim-known', 'claim-other');
    db.run(
      `INSERT INTO memory_episodes (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model, valid_from, recorded_at, raw_excerpt, summary)
       VALUES ('ep-1', 'sess-1', 'u1', 'u2', 'claude_code', 'test-model', ?, ?, 'excerpt', 'summary')`,
      [AT, AT],
    );
    db.run(
      `INSERT INTO memory_episode_entities (episode_id, entity_id, mention_text) VALUES ('ep-1', 'claim-known', 'claim-known')`,
    );

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('claim-known')?.['valid_until']).toBeNull();
    expect(db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get('claim-other')?.['valid_until']).toBe(NOW);
    expect(result.soft_deleted_orphan_entities).toBe(1);

    db.close();
  });

  test('specRoot に Markdown が 1 件も無いときは何も消さず error を返す', () => {
    const db = makeDb();
    insertSpecDoc(db, 'doc-a', 'a.ja.md', 'ent-a');
    insertSpecDoc(db, 'doc-b', 'b.ja.md', 'ent-b');

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.status).toBe('error');
    expect(result.removed_docs).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM memory_spec_documents').get()?.['n']).toBe(2);

    db.close();
  });

  test('specRoot が存在しないときは何も消さず error を返す', () => {
    const db = makeDb();
    insertSpecDoc(db, 'doc-a', 'a.ja.md', 'ent-a');

    const result = runSpecReconciliation({ db, specRoot: join(specRoot, 'no-such-dir'), recordedAt: NOW });

    expect(result.status).toBe('error');
    expect(result.removed_docs).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM memory_spec_documents').get()?.['n']).toBe(1);

    db.close();
  });

  test('既に閉じた edge は二重に無効化記録しない', () => {
    const db = makeDb();
    writeSpec(specRoot, 'live.ja.md');
    insertSpecDoc(db, 'doc-live', 'live.ja.md', 'ent-live');
    insertSpecDoc(db, 'doc-gone', 'gone.ja.md', 'ent-gone');
    insertEntity(db, 'claim-a', 'Concept', 'claim-a');
    insertEntity(db, 'claim-b', 'Concept', 'claim-b');
    insertSpecEdge(db, 'edge-closed', 'doc-gone', 'claim-a', 'claim-b');
    db.run(`UPDATE memory_edges SET valid_to = ? WHERE id = 'edge-closed'`, ['2026-04-01T00:00:00.000Z']);

    const result = runSpecReconciliation({ db, specRoot, recordedAt: NOW });

    expect(result.invalidated_edges).toBe(0);
    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get('edge-closed')?.['valid_to']).toBe('2026-04-01T00:00:00.000Z');
    expect(db.prepare('SELECT COUNT(*) n FROM memory_edge_invalidations').get()?.['n']).toBe(0);

    db.close();
  });
});
