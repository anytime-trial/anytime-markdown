import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase3-${process.pid}-${Date.now()}.db`);
}

const TS = '2026-01-01T00:00:00.000Z';

function insertEntity(db: Database, id: string, canonicalName: string): void {
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, canonicalName, canonicalName, TS, TS, TS],
  );
}

function insertSpecDoc(db: Database, id: string, relPath: string, type = 'spec'): void {
  db.run(
    `INSERT INTO memory_spec_documents
       (id, rel_path, type, title, source_hash, recorded_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, relPath, type, 'Test Document', 'abc123hash', TS, TS],
  );
}

describe('Phase 3 migration (008_phase3)', () => {
  const dbs: string[] = [];

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  async function openFresh() {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    return openMemoryCoreDb();
  }

  // ── Table creation ──────────────────────────────────────────────────────────

  test('memory_spec_documents table is created', async () => {
    const { db, close } = await openFresh();
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_spec_documents'",
    );
    expect(result[0]?.values?.length).toBe(1);
    close();
  }, 30000);

  test('memory_spec_doc_entities table is created', async () => {
    const { db, close } = await openFresh();
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_spec_doc_entities'",
    );
    expect(result[0]?.values?.length).toBe(1);
    close();
  }, 30000);

  // ── INSERT constraints ──────────────────────────────────────────────────────

  test("memory_spec_documents: type='spec' insert succeeds", async () => {
    const { db, close } = await openFresh();
    expect(() => {
      insertSpecDoc(db, 'doc-spec-1', 'spec/design.md', 'spec');
    }).not.toThrow();
    const count = db.exec("SELECT COUNT(*) FROM memory_spec_documents WHERE id = 'doc-spec-1'");
    expect(count[0]?.values?.[0]?.[0] as number).toBe(1);
    close();
  }, 30000);

  test("memory_spec_documents: type='unknown' insert throws CHECK violation", async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_spec_documents
           (id, rel_path, type, title, source_hash, recorded_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['doc-bad-type', 'spec/bad.md', 'unknown', 'Bad Doc', 'abc123', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  test('memory_spec_documents: malformed updated_at throws CHECK violation', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_spec_documents
           (id, rel_path, type, title, source_hash, recorded_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['doc-bad-ts', 'spec/bad-ts.md', 'spec', 'Bad TS Doc', 'abc123', TS, '2026-01-01'],
      );
    }).toThrow();
    close();
  }, 30000);

  // ── CASCADE delete ──────────────────────────────────────────────────────────

  test('deleting spec_doc cascades to memory_spec_doc_entities', async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-cascade-1', 'cascade-concept-1');
    insertSpecDoc(db, 'doc-cascade-1', 'spec/cascade.md');
    db.run(
      `INSERT INTO memory_spec_doc_entities (spec_doc_id, entity_id, line_hint)
       VALUES (?, ?, ?)`,
      ['doc-cascade-1', 'ent-cascade-1', 42],
    );
    // verify link exists
    const before = db.exec(
      "SELECT COUNT(*) FROM memory_spec_doc_entities WHERE spec_doc_id = 'doc-cascade-1'",
    );
    expect(before[0]?.values?.[0]?.[0] as number).toBe(1);
    // delete parent
    db.run("DELETE FROM memory_spec_documents WHERE id = 'doc-cascade-1'");
    // link should be gone
    const after = db.exec(
      "SELECT COUNT(*) FROM memory_spec_doc_entities WHERE spec_doc_id = 'doc-cascade-1'",
    );
    expect(after[0]?.values?.[0]?.[0] as number).toBe(0);
    close();
  }, 30000);

  // ── Version and idempotency ─────────────────────────────────────────────────

  test('_migrations has version=1–8 all present', async () => {
    const { db, close } = await openFresh();
    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);
    for (let v = 1; v <= 8; v++) {
      expect(versions).toContain(v);
    }
    close();
  }, 30000);

  test('migration is idempotent: open twice → COUNT=8', async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;

    const { save: save1, close: close1 } = await openMemoryCoreDb();
    save1();
    close1();

    const { db: db2, close: close2 } = await openMemoryCoreDb();
    const result = db2.exec('SELECT COUNT(*) FROM _migrations');
    const count = result[0]?.values[0][0] as number;
    expect(count).toBe(8);
    close2();
  }, 30000);

  // ── FK integrity ────────────────────────────────────────────────────────────

  test('foreign_key_check returns zero violations after migration', async () => {
    const { db, close } = await openFresh();
    const violations = db.exec('PRAGMA foreign_key_check');
    const rows = violations[0]?.values ?? [];
    expect(rows.length).toBe(0);
    close();
  }, 30000);
});
