import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { reportDriftEvents } from '../../src/drift/report';
import type { DriftEventInput } from '../../src/drift/report';
import type { MemoryLogger } from '../../src/logger';

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

function makeDb(): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS = '2026-01-01T00:00:00.000Z';
const TS2 = '2026-01-02T00:00:00.000Z';

let entitySeq = 0;
function insertEntity(db: Database): string {
  const id = `ent-${++entitySeq}`;
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, `concept-${id}`, `Concept ${id}`, TS, TS, TS],
  );
  return id;
}

function makeCandidate(
  subject_entity_id: string,
  overrides: Partial<DriftEventInput> = {},
): DriftEventInput {
  return {
    subject_entity_id,
    predicate: 'uses',
    conversation_value: null,
    spec_value: 'zustand',
    code_value: 'redux',
    drift_type: 'spec_vs_code',
    severity: 'error',
    detail: { active_edges: [] },
    ...overrides,
  };
}

describe('reportDriftEvents', () => {
  it('I8: spec_vs_code 1 件 → events_inserted=1, severity=error', () => {
    const db = makeDb();
    const subjId = insertEntity(db);
    const result = reportDriftEvents({
      db,
      candidates: [makeCandidate(subjId)],
      recordedAt: TS,
      logger: silentLogger,
    });
    expect(result.events_inserted).toBe(1);
    expect(result.events_updated).toBe(0);
    expect(result.events_resolved).toBe(0);

    const rows = db.exec(
      "SELECT severity FROM memory_drift_events WHERE drift_type = 'spec_vs_code' AND resolved_at IS NULL",
    );
    expect(rows[0]?.values[0]?.[0]).toBe('error');
  });

  it('I9: three_way 1 件 → events_inserted=1', () => {
    const db = makeDb();
    const subjId = insertEntity(db);
    const result = reportDriftEvents({
      db,
      candidates: [makeCandidate(subjId, { drift_type: 'three_way', severity: 'error' })],
      recordedAt: TS,
      logger: silentLogger,
    });
    expect(result.events_inserted).toBe(1);
  });

  it('I10: 消滅した event は auto-resolve される', () => {
    const db = makeDb();
    const subjId = insertEntity(db);

    // 1回目: 1 件 insert
    reportDriftEvents({
      db,
      candidates: [makeCandidate(subjId)],
      recordedAt: TS,
      logger: silentLogger,
    });

    // 2回目: 候補なし → auto-resolve
    const result = reportDriftEvents({
      db,
      candidates: [],
      recordedAt: TS2,
      logger: silentLogger,
    });

    expect(result.events_resolved).toBe(1);

    const rows = db.exec('SELECT resolved_at FROM memory_drift_events');
    expect(rows[0]?.values[0]?.[0]).toBe(TS2);
  });

  it('同候補を 2 回 reportDriftEvents → 2 回目は events_inserted=0, events_updated=1', () => {
    const db = makeDb();
    const subjId = insertEntity(db);
    const candidate = makeCandidate(subjId);

    reportDriftEvents({ db, candidates: [candidate], recordedAt: TS, logger: silentLogger });
    const result = reportDriftEvents({
      db,
      candidates: [candidate],
      recordedAt: TS2,
      logger: silentLogger,
    });

    expect(result.events_inserted).toBe(0);
    expect(result.events_updated).toBe(1);
    expect(result.events_resolved).toBe(0);
  });

  it('autoResolveStale=false → 消滅した event は resolved にならない', () => {
    const db = makeDb();
    const subjId = insertEntity(db);

    reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS, logger: silentLogger });
    const result = reportDriftEvents({
      db,
      candidates: [],
      recordedAt: TS2,
      autoResolveStale: false,
      logger: silentLogger,
    });

    expect(result.events_resolved).toBe(0);
    const rows = db.exec('SELECT resolved_at FROM memory_drift_events');
    expect(rows[0]?.values[0]?.[0]).toBeNull();
  });

  it('detail_json に policy_version が含まれる', () => {
    const db = makeDb();
    const subjId = insertEntity(db);

    reportDriftEvents({
      db,
      candidates: [makeCandidate(subjId, { detail: { active_edges: [] } })],
      recordedAt: TS,
      logger: silentLogger,
    });

    const rows = db.exec('SELECT detail_json FROM memory_drift_events');
    const detail = JSON.parse(rows[0]?.values[0]?.[0] as string);
    expect(detail.policy_version).toBe('phase4-v1');
  });

  it('detected_at は 2 回目更新で変化しない', () => {
    const db = makeDb();
    const subjId = insertEntity(db);
    const candidate = makeCandidate(subjId);

    reportDriftEvents({ db, candidates: [candidate], recordedAt: TS, logger: silentLogger });
    reportDriftEvents({ db, candidates: [candidate], recordedAt: TS2, logger: silentLogger });

    const rows = db.exec('SELECT detected_at FROM memory_drift_events WHERE resolved_at IS NULL');
    expect(rows[0]?.values[0]?.[0]).toBe(TS);
  });
});
