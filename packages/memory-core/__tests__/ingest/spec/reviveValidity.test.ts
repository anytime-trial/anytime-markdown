import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../../src/db/migrations/runner';
import { runSpecReconciliation } from '../../../src/pipeline/runSpecReconciliation';
import { upsertSpecDoc, upsertSpecClaims } from '../../../src/ingest/spec/persist';
import type { ParsedSpec } from '../../../src/ingest/spec/parseFrontmatter';

const AT = '2026-05-12T00:00:00.000Z';
const REMOVED_AT = '2026-05-12T01:00:00.000Z';
const REVIVED_AT = '2026-05-12T02:00:00.000Z';

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function parsedSpec(relPath: string): ParsedSpec {
  return {
    rel_path: relPath,
    frontmatter: { type: 'spec', title: relPath, updated: '2026-05-12', c4Scope: [] },
    body: '本文',
  } as unknown as ParsedSpec;
}

function writeSpec(root: string, relPath: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '---\ntype: spec\n---\n本文\n', 'utf-8');
}

function validUntil(db: BetterSqlite3MemoryDb, id: string): unknown {
  return db.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get(id)?.['valid_until'];
}

describe('reviveSpecDocValidity（設計書の復活）', () => {
  let specRoot: string;

  beforeEach(() => {
    specRoot = mkdtempSync(join(tmpdir(), 'spec-revive-'));
  });

  afterEach(() => {
    rmSync(specRoot, { recursive: true, force: true });
  });

  test('消える → ファイルが戻る → 再 ingest で entity と edge の無効化が剥がれる', () => {
    const db = makeDb();
    // 生存させる 1 件（消失率ガードに掛からないようにする）
    writeSpec(specRoot, 'keep.ja.md');
    const keep = upsertSpecDoc({ db, parsed: parsedSpec('keep.ja.md'), source_hash: 'h', recordedAt: AT });
    expect(keep.specDocId).toBeTruthy();

    // 対象ドキュメントを ingest（claim edge 付き）
    writeSpec(specRoot, 'target.ja.md');
    const target = upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h', recordedAt: AT });
    db.run(
      `INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description)
       VALUES ('must', 'multiple_active', 'subject_to_object', 'test')`,
    );
    upsertSpecClaims({
      db,
      specDocId: target.specDocId,
      specEntityId: target.specEntityId,
      claims: [
        {
          subject: { type: 'Package', name: 'pkg-target' },
          predicate: 'must',
          object: { type: 'Concept', name: 'concept-target' },
          confidence: 1,
          modality: 'mandatory',
        },
      ] as never,
      recordedAt: AT,
    });

    const edgeIdRow = db.prepare(
      `SELECT id FROM memory_edges WHERE source_ref = ?`,
    ).get(`spec_doc#${target.specDocId}`);
    const edgeId = String(edgeIdRow?.['id']);
    expect(edgeId).not.toBe('undefined');

    // 1. ファイルが消える → 掃除
    rmSync(join(specRoot, 'target.ja.md'));
    const removed = runSpecReconciliation({ db, specRoot, recordedAt: REMOVED_AT });
    expect(removed.removed_docs).toBe(1);
    expect(validUntil(db, target.specEntityId)).toBe(REMOVED_AT);
    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get(edgeId)?.['valid_to']).toBe(REMOVED_AT);

    // 2. ファイルが戻る → 再 ingest
    writeSpec(specRoot, 'target.ja.md');
    const again = upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h2', recordedAt: REVIVED_AT });
    expect(again.specDocId).toBe(target.specDocId);

    // 3. 無効化が剥がれている（ゴーストにならない）
    expect(validUntil(db, target.specEntityId)).toBeNull();
    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get(edgeId)?.['valid_to']).toBeNull();
    expect(db.prepare('SELECT COUNT(*) n FROM memory_spec_documents').get()?.['n']).toBe(2);

    db.close();
  });

  test('孤立扱いで無効化された claim entity も復活する', () => {
    const db = makeDb();
    writeSpec(specRoot, 'keep.ja.md');
    upsertSpecDoc({ db, parsed: parsedSpec('keep.ja.md'), source_hash: 'h', recordedAt: AT });
    writeSpec(specRoot, 'target.ja.md');
    const target = upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h', recordedAt: AT });
    db.run(
      `INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description)
       VALUES ('must', 'multiple_active', 'subject_to_object', 'test')`,
    );
    upsertSpecClaims({
      db,
      specDocId: target.specDocId,
      specEntityId: target.specEntityId,
      claims: [
        {
          subject: { type: 'Concept', name: 'only-here-subject' },
          predicate: 'must',
          object: { type: 'Concept', name: 'only-here-object' },
          confidence: 1,
          modality: 'mandatory',
        },
      ] as never,
      recordedAt: AT,
    });
    const subjectId = String(
      db.prepare("SELECT id FROM memory_entities WHERE canonical_name = 'only-here-subject'").get()?.['id'],
    );

    rmSync(join(specRoot, 'target.ja.md'));
    const removed = runSpecReconciliation({ db, specRoot, recordedAt: REMOVED_AT });
    expect(removed.soft_deleted_orphan_entities).toBe(2);
    expect(validUntil(db, subjectId)).toBe(REMOVED_AT);

    writeSpec(specRoot, 'target.ja.md');
    upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h2', recordedAt: REVIVED_AT });

    expect(validUntil(db, subjectId)).toBeNull();

    db.close();
  });

  test('rule_exclusive で無効化された edge は復活させない', () => {
    const db = makeDb();
    writeSpec(specRoot, 'keep.ja.md');
    upsertSpecDoc({ db, parsed: parsedSpec('keep.ja.md'), source_hash: 'h', recordedAt: AT });
    writeSpec(specRoot, 'target.ja.md');
    const target = upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h', recordedAt: AT });
    db.run(
      `INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description)
       VALUES ('must', 'multiple_active', 'subject_to_object', 'test')`,
    );
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES ('sup-a', 'Concept', 'sup-a', 'sup-a', ?, ?, ?)`,
      [AT, AT, AT],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality, attributes_json)
       VALUES ('edge-superseded', 'sup-a', 'must', 'sup-a', ?, ?, ?, 'spec', ?, 1.0, 'EXTRACTED', 'mandatory', '{}')`,
      [AT, AT, AT, `spec_doc#${target.specDocId}`],
    );
    db.run(
      `INSERT INTO memory_edge_invalidations (id, edge_id, invalidated_at, reason, superseding_edge_id, detail)
       VALUES ('inv-1', 'edge-superseded', ?, 'rule_exclusive', NULL, '')`,
      [AT],
    );

    rmSync(join(specRoot, 'target.ja.md'));
    runSpecReconciliation({ db, specRoot, recordedAt: REMOVED_AT });
    writeSpec(specRoot, 'target.ja.md');
    upsertSpecDoc({ db, parsed: parsedSpec('target.ja.md'), source_hash: 'h2', recordedAt: REVIVED_AT });

    expect(db.prepare('SELECT valid_to FROM memory_edges WHERE id = ?').get('edge-superseded')?.['valid_to']).toBe(AT);

    db.close();
  });
});
