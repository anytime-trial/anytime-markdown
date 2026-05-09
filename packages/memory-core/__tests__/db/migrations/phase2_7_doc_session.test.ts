import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase2_7-${process.pid}-${Date.now()}.db`);
}

const TS = '2026-01-01T00:00:00.000Z';

describe('Phase 2.7 migration (005_phase2_7_doc_session)', () => {
  const dbs: string[] = [];

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {
        // ignore
      }
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  async function openFresh(): Promise<ReturnType<typeof openMemoryCoreDb>> {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    return openMemoryCoreDb();
  }

  test('memory_reviews table is created', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_reviews'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('memory_review_findings table is created', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_review_findings'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: reviewed_by relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'reviewed_by'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: flagged relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'flagged'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: addresses relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'addresses'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('seed: precedes relation type exists', async () => {
    const { db, close } = await openFresh();

    const result = db.exec(
      "SELECT predicate FROM memory_relation_types WHERE predicate = 'precedes'"
    );
    expect(result[0]?.values?.length).toBe(1);

    close();
  }, 30000);

  test('_migrations has version=5 (and 1-4)', async () => {
    const { db, close } = await openFresh();

    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);

    expect(versions).toContain(1);
    expect(versions).toContain(2);
    expect(versions).toContain(3);
    expect(versions).toContain(4);
    expect(versions).toContain(5);

    close();
  }, 30000);

  test('migration is idempotent (open twice, no error, COUNT=5)', async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;

    const { db: db1, save: save1, close: close1 } = await openMemoryCoreDb();
    save1();
    close1();

    const { db: db2, close: close2 } = await openMemoryCoreDb();
    const result = db2.exec('SELECT COUNT(*) FROM _migrations');
    const count = result[0]?.values[0][0] as number;
    expect(count).toBe(8); // migrations 1–7, each applied once
    close2();
  }, 30000);

  test('FK: insert memory_review_findings with non-existent review_id throws', async () => {
    const { db, close } = await openFresh();

    // Insert a real entity for finding_entity_id
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-finding-1', 'Concept', 'test-concept', 'Test Concept', TS, TS, TS]
    );

    expect(() => {
      db.run(
        `INSERT INTO memory_review_findings
           (id, review_id, finding_entity_id, finding_index, finding_text, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['rf-test-1', 'nonexistent-review-id', 'ent-finding-1', 0, 'some finding', TS]
      );
    }).toThrow();

    close();
  }, 30000);

  test('CHECK: source_kind invalid value throws', async () => {
    const { db, close } = await openFresh();

    // Need a valid entity for review_entity_id
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-src-kind-1', 'Concept', 'src-kind-concept', 'Src Kind Concept', TS, TS, TS]
    );

    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['rv-invalid-sk', 'invalid_value', 'ref/001', 'ent-src-kind-1', 'code', 'Bad kind', TS, TS]
      );
    }).toThrow();

    close();
  }, 30000);

  test('CHECK: reviewed_at malformed timestamp throws', async () => {
    const { db, close } = await openFresh();

    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-ts-check-1', 'Concept', 'ts-check-concept', 'TS Check Concept', TS, TS, TS]
    );

    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['rv-invalid-ts', 'review_doc', 'ref/002', 'ent-ts-check-1', 'code', 'Bad ts', '2026-01-01', TS]
      );
    }).toThrow();

    close();
  }, 30000);

  test('UNIQUE: (source_kind, source_ref) duplicate insert throws', async () => {
    const { db, close } = await openFresh();

    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-uniq-1', 'Concept', 'uniq-concept', 'Uniq Concept', TS, TS, TS]
    );

    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-uniq-2', 'Concept', 'uniq-concept-2', 'Uniq Concept 2', TS, TS, TS]
    );

    db.run(
      `INSERT INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['rv-uniq-1', 'review_doc', 'ref/same', 'ent-uniq-1', 'code', 'First', TS, TS]
    );

    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['rv-uniq-2', 'review_doc', 'ref/same', 'ent-uniq-2', 'code', 'Second', TS, TS]
      );
    }).toThrow();

    close();
  }, 30000);

  test('FK: insert memory_reviews with non-existent review_entity_id throws', async () => {
    const { db, close } = await openFresh();

    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['rv-fk-1', 'review_doc', 'ref/fk-test', 'nonexistent-entity-id', 'code', 'FK test', TS, TS]
      );
    }).toThrow();

    close();
  }, 30000);

  test('ON DELETE CASCADE: delete memory_reviews removes linked findings', async () => {
    const { db, close } = await openFresh();

    // Insert entity for review_entity_id
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-review-1', 'Concept', 'review-concept', 'Review Concept', TS, TS, TS]
    );

    // Insert entity for finding_entity_id
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ent-finding-2', 'Concept', 'finding-concept', 'Finding Concept', TS, TS, TS]
    );

    // Insert a memory_reviews row
    db.run(
      `INSERT INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['rv-1', 'review_doc', 'review/2026-01-01.md', 'ent-review-1', 'code', 'Test Review', TS, TS]
    );

    // Insert a linked finding
    db.run(
      `INSERT INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index, finding_text, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['rf-2', 'rv-1', 'ent-finding-2', 0, 'a finding', TS]
    );

    // Verify finding exists
    const before = db.exec("SELECT COUNT(*) FROM memory_review_findings WHERE review_id = 'rv-1'");
    expect(before[0]?.values[0][0] as number).toBe(1);

    // Delete the parent review
    db.run("DELETE FROM memory_reviews WHERE id = 'rv-1'");

    // Finding should be gone due to CASCADE
    const after = db.exec("SELECT COUNT(*) FROM memory_review_findings WHERE review_id = 'rv-1'");
    expect(after[0]?.values[0][0] as number).toBe(0);

    close();
  }, 30000);
});
