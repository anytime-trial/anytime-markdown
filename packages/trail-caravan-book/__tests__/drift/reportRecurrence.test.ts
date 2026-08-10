import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { reportDriftEvents } from '../../src/drift/report';
import type { DriftEventInput } from '../../src/drift/report';
import type { CaravanLogger } from '../../src/logger';

/**
 * 解決済み drift が再発したときに記録されるか。
 *
 * caravan_drift_events.id は (subject, predicate, drift_type) だけから決まり時刻を含まない。
 * 一方 upsert の突合対象は `resolved_at IS NULL` の行だけなので、一度 resolve した key は
 * 「既存なし」と判定されて INSERT へ回り、解決済み行と PK が衝突する。
 */
function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS1 = '2026-01-01T00:00:00.000Z';
const TS2 = '2026-01-02T00:00:00.000Z';
const TS3 = '2026-01-03T00:00:00.000Z';

function insertEntity(db: BetterSqlite3CaravanDb, id: string): string {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
    [id, `concept-${id}`, `Concept ${id}`, TS1, TS1, TS1],
  );
  return id;
}

function makeCandidate(subject_entity_id: string): DriftEventInput {
  return {
    subject_entity_id,
    predicate: 'uses',
    conversation_value: null,
    spec_value: 'zustand',
    code_value: 'redux',
    drift_type: 'spec_vs_code',
    severity: 'error',
    workspace: '',
    detail: { active_edges: [] },
  };
}

function makeLogger(): { logger: CaravanLogger; errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    logger: {
      info: () => {},
      error: (msg: string) => {
        errors.push(msg);
      },
    },
  };
}

describe('reportDriftEvents: 解決済み drift の再発', () => {
  it('resolve 後に同じ drift を再検出したら、再び未解決として記録される', () => {
    const db = makeDb();
    const subjId = insertEntity(db, 'ent-recur-1');
    const { logger, errors } = makeLogger();

    // 1. 初回検出
    const first = reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS1, logger });
    expect(first.events_inserted).toBe(1);

    // 2. drift が消えたので auto-resolve
    const resolved = reportDriftEvents({ db, candidates: [], recordedAt: TS2, logger });
    expect(resolved.events_resolved).toBe(1);

    // 3. 同じ drift が再発
    const second = reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS3, logger });

    // 失敗が例外ログへ落ちて握り潰されていないこと
    expect(errors).toEqual([]);
    expect(second.events_reopened).toBe(1);
    expect(second.events_inserted).toBe(0);

    const active = db.exec(
      `SELECT COUNT(*) FROM caravan_drift_events
        WHERE drift_type = 'spec_vs_code' AND resolved_at IS NULL`,
    );
    expect(active[0]?.values[0]?.[0]).toBe(1);
  });

  it('reopen 時に detected_at を再発時刻へ進め、前ライフサイクルを reopen_history に残す', () => {
    const db = makeDb();
    const subjId = insertEntity(db, 'ent-recur-2');
    const { logger, errors } = makeLogger();

    reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS1, logger });
    reportDriftEvents({ db, candidates: [], recordedAt: TS2, logger });
    reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS3, logger });

    expect(errors).toEqual([]);
    const rows = db.exec(
      `SELECT detected_at, resolved_at, resolution_note, detail_json
         FROM caravan_drift_events WHERE drift_type = 'spec_vs_code'`,
    );
    const row = rows[0]?.values[0];
    expect(row?.[0]).toBe(TS3);
    expect(row?.[1]).toBeNull();
    expect(row?.[2]).toBe('');

    const detail = JSON.parse(String(row?.[3])) as {
      reopen_history?: Array<Record<string, string>>;
    };
    expect(detail.reopen_history).toHaveLength(1);
    expect(detail.reopen_history?.[0]).toMatchObject({
      reopened_at: TS3,
      previous_detected_at: TS1,
      previous_resolved_at: TS2,
      previous_resolution_note: 'auto: drift no longer present',
    });
  });

  it('未解決のまま再検出された drift は reopen ではなく update として数える', () => {
    const db = makeDb();
    const subjId = insertEntity(db, 'ent-recur-3');
    const { logger, errors } = makeLogger();

    reportDriftEvents({ db, candidates: [makeCandidate(subjId)], recordedAt: TS1, logger });
    const again = reportDriftEvents({
      db,
      candidates: [makeCandidate(subjId)],
      recordedAt: TS2,
      logger,
    });

    expect(errors).toEqual([]);
    expect(again.events_updated).toBe(1);
    expect(again.events_reopened).toBe(0);

    // 未解決のままの更新では detected_at を動かさない（滞留期間の起点を保つ）。
    const rows = db.exec(
      "SELECT detected_at FROM caravan_drift_events WHERE drift_type = 'spec_vs_code'",
    );
    expect(rows[0]?.values[0]?.[0]).toBe(TS1);
  });
});
