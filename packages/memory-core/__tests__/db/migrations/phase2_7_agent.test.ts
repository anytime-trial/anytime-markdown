import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase2_7_agent-${process.pid}-${Date.now()}.db`);
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

describe('Phase 2.7 migration (007_phase2_7_agent)', () => {
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

  test('memory_review_runs table is created', async () => {
    const { db, close } = await openFresh();
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_review_runs'",
    );
    expect(result[0]?.values?.length).toBe(1);
    close();
  }, 30000);

  // ── source_kind='agent' extension ──────────────────────────────────────────

  test("memory_reviews.source_kind accepts 'agent'", async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-agent-1', 'agent-concept-1');
    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, 'agent', ?, ?, 'code', 'Agent Review', ?, ?)`,
        ['rv-agent-1', 'agent-run/run-001', 'ent-agent-1', TS, TS],
      );
    }).not.toThrow();
    const count = db.exec(
      "SELECT COUNT(*) FROM memory_reviews WHERE source_kind = 'agent'",
    );
    expect(count[0]?.values?.[0]?.[0] as number).toBe(1);
    close();
  }, 30000);

  test("memory_reviews.source_kind still accepts 'review_doc' and 'session'", async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-src-1', 'src-concept-1');
    insertEntity(db, 'ent-src-2', 'src-concept-2');
    db.run(
      `INSERT INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, 'review_doc', 'docs/r.md', ?, 'code', 'Doc Review', ?, ?)`,
      ['rv-doc-1', 'ent-src-1', TS, TS],
    );
    db.run(
      `INSERT INTO memory_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES (?, 'session', 'sess-001#msg-001', ?, 'code', 'Session Review', ?, ?)`,
      ['rv-sess-1', 'ent-src-2', TS, TS],
    );
    const count = db.exec(
      "SELECT COUNT(*) FROM memory_reviews WHERE source_kind IN ('review_doc', 'session')",
    );
    expect(count[0]?.values?.[0]?.[0] as number).toBe(2);
    close();
  }, 30000);

  test('memory_reviews.source_kind rejects invalid value after migration', async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-inv-1', 'inv-concept-1');
    expect(() => {
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, 'invalid_source', 'ref/x', ?, 'code', 'Bad', ?, ?)`,
        ['rv-inv-1', 'ent-inv-1', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  // ── memory_review_runs CHECK constraints ────────────────────────────────────

  test('memory_review_runs: valid insert succeeds', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'manual', 'code', 'qwen3.5:9b', 'logic', 'abc123', ?, 'running', ?)`,
        ['run-valid-1', TS, TS],
      );
    }).not.toThrow();
    const count = db.exec("SELECT COUNT(*) FROM memory_review_runs WHERE id = 'run-valid-1'");
    expect(count[0]?.values?.[0]?.[0] as number).toBe(1);
    close();
  }, 30000);

  test('memory_review_runs: CHECK trigger_kind rejects invalid value', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'invalid_trigger', 'code', 'test-model', 'logic', 'h1', ?, 'running', ?)`,
        ['run-bad-trigger', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  test('memory_review_runs: CHECK status rejects invalid value', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'manual', 'code', 'test-model', 'logic', 'h1', ?, 'invalid_status', ?)`,
        ['run-bad-status', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  test('memory_review_runs: CHECK prompt_kind rejects invalid value', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'manual', 'code', 'test-model', 'invalid_kind', 'h1', ?, 'running', ?)`,
        ['run-bad-prompt', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  test('memory_review_runs: FK review_id is nullable (NULL succeeds)', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'hook', 'spec', 'test-model', 'a11y', 'def456', ?, 'success', ?)`,
        ['run-null-rev', TS, TS],
      );
    }).not.toThrow();
    close();
  }, 30000);

  test('memory_review_runs: FK review_id rejects non-existent review', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, review_id, recorded_at)
         VALUES (?, 'hook', 'spec', 'test-model', 'a11y', 'def456', ?, 'success', 'nonexistent-review', ?)`,
        ['run-bad-fk', TS, TS],
      );
    }).toThrow();
    close();
  }, 30000);

  test('memory_review_runs: started_at GLOB CHECK rejects malformed timestamp', async () => {
    const { db, close } = await openFresh();
    expect(() => {
      db.run(
        `INSERT INTO memory_review_runs
           (id, trigger_kind, target_kind, model, prompt_kind, prompt_hash, started_at, status, recorded_at)
         VALUES (?, 'manual', 'code', 'test-model', 'logic', 'h1', '2026-01-01', 'running', ?)`,
        ['run-bad-ts', TS],
      );
    }).toThrow();
    close();
  }, 30000);

  // ── Version and idempotency ─────────────────────────────────────────────────

  test('_migrations has version=7 (and 1–6)', async () => {
    const { db, close } = await openFresh();
    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
    expect(versions).toContain(3);
    expect(versions).toContain(4);
    expect(versions).toContain(5);
    expect(versions).toContain(6);
    expect(versions).toContain(7);
    close();
  }, 30000);

  test('migration is idempotent: open twice → COUNT=7', async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;

    const { save: save1, close: close1 } = await openMemoryCoreDb();
    save1();
    close1();

    const { db: db2, close: close2 } = await openMemoryCoreDb();
    const result = db2.exec('SELECT COUNT(*) FROM _migrations');
    const count = result[0]?.values[0][0] as number;
    expect(count).toBe(7);
    close2();
  }, 30000);

  // ── FK integrity after 12-step migration ────────────────────────────────────

  test('foreign_key_check returns zero violations after migration', async () => {
    const { db, close } = await openFresh();
    const violations = db.exec('PRAGMA foreign_key_check');
    const rows = violations[0]?.values ?? [];
    expect(rows.length).toBe(0);
    close();
  }, 30000);
});
