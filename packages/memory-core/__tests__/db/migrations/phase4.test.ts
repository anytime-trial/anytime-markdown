import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-phase4-${process.pid}-${Date.now()}.db`);
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

function insertDriftEvent(
  db: Database,
  id: string,
  entityId: string,
  driftType = 'spec_vs_code',
  severity = 'warn',
): void {
  db.run(
    `INSERT INTO memory_drift_events
       (id, subject_entity_id, predicate, drift_type, severity, detected_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, entityId, 'test-predicate', driftType, severity, TS],
  );
}

describe('Phase 4 migration (009_phase4)', () => {
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

  test('memory_drift_events table is created', async () => {
    const { db, close } = await openFresh();
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_drift_events'",
    );
    expect(result[0]?.values?.length).toBe(1);
    close();
  }, 30000);

  // ── Idempotency ─────────────────────────────────────────────────────────────

  test('migration is idempotent: open twice → COUNT=9', async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;

    const { save: save1, close: close1 } = await openMemoryCoreDb();
    save1();
    close1();

    const { db: db2, close: close2 } = await openMemoryCoreDb();
    const result = db2.exec('SELECT COUNT(*) FROM _migrations');
    const count = result[0]?.values[0][0] as number;
    expect(count).toBe(9);
    close2();
  }, 30000);

  // ── Version ─────────────────────────────────────────────────────────────────

  test('_migrations has version=9 recorded', async () => {
    const { db, close } = await openFresh();
    const result = db.exec('SELECT version FROM _migrations ORDER BY version');
    const versions = (result[0]?.values ?? []).map((r) => r[0] as number);
    expect(versions).toContain(9);
    close();
  }, 30000);

  // ── CHECK constraints: drift_type ───────────────────────────────────────────

  test("drift_type='unknown' insert throws CHECK violation", async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-dt-1', 'concept-dt-1');
    expect(() => {
      db.run(
        `INSERT INTO memory_drift_events
           (id, subject_entity_id, predicate, drift_type, severity, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['evt-bad-dt', 'ent-dt-1', 'pred', 'unknown', 'warn', TS],
      );
    }).toThrow();
    close();
  }, 30000);

  // ── UNIQUE constraint ────────────────────────────────────────────────────────

  test('UNIQUE (subject_entity_id, predicate, drift_type) duplicate insert throws', async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-uniq-1', 'concept-uniq-1');
    insertDriftEvent(db, 'evt-uniq-1', 'ent-uniq-1', 'spec_vs_code', 'warn');
    expect(() => {
      insertDriftEvent(db, 'evt-uniq-2', 'ent-uniq-1', 'spec_vs_code', 'error');
    }).toThrow();
    close();
  }, 30000);

  // ── CHECK constraints: severity ─────────────────────────────────────────────

  test("severity='critical' insert throws CHECK violation", async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-sev-1', 'concept-sev-1');
    expect(() => {
      db.run(
        `INSERT INTO memory_drift_events
           (id, subject_entity_id, predicate, drift_type, severity, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['evt-bad-sev', 'ent-sev-1', 'pred', 'spec_vs_code', 'critical', TS],
      );
    }).toThrow();
    close();
  }, 30000);

  // ── CHECK constraints: detected_at GLOB ─────────────────────────────────────

  test('detected_at with invalid format throws CHECK violation', async () => {
    const { db, close } = await openFresh();
    insertEntity(db, 'ent-ts-1', 'concept-ts-1');
    expect(() => {
      db.run(
        `INSERT INTO memory_drift_events
           (id, subject_entity_id, predicate, drift_type, severity, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['evt-bad-ts', 'ent-ts-1', 'pred', 'spec_vs_code', 'warn', '2026-01-01'],
      );
    }).toThrow();
    close();
  }, 30000);
});
