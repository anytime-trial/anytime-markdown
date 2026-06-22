import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { reportDriftEvents } from '../../src/drift/report';
import type { DriftEventInput } from '../../src/drift/report';
import type { MemoryLogger } from '../../src/logger';
import { entityId } from '../../src/canonical/entityId';
import { canonicalize } from '../../src/canonical/canonicalize';

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS = '2026-01-01T00:00:00.000Z';
const TS2 = '2026-01-02T00:00:00.000Z';

let entitySeq = 0;
function insertEntity(db: BetterSqlite3MemoryDb): string {
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

  // 回帰: 検出器が生成する合成 ID(file:/package:/spec_clarification:)は memory_entities に
  // 直接存在しないため、旧実装では FK 違反で INSERT が silent に弾かれ regression_cluster 等が
  // 常に 0 件だった。reportDriftEvents が正準 entity へ写像・確保することで救済する。
  it('synthetic file: id → 正準 File entity を作成して連結し insert 成功', () => {
    const db = makeDb(); // foreign_keys = ON
    const result = reportDriftEvents({
      db,
      candidates: [
        makeCandidate('file:packages/foo/bar.ts', {
          predicate: 'affects',
          drift_type: 'regression_cluster',
          severity: 'error',
        }),
      ],
      recordedAt: TS,
      logger: silentLogger,
    });

    expect(result.events_inserted).toBe(1);

    // drift の subject は合成 ID ではなく正準 File entity id（ハッシュ）。
    const canonId = entityId('File', canonicalize('packages/foo/bar.ts'));
    const drift = db.exec(
      "SELECT subject_entity_id FROM memory_drift_events WHERE drift_type = 'regression_cluster'",
    );
    expect(drift[0]?.values[0]?.[0]).toBe(canonId);
    const ent = db.exec(
      'SELECT type, canonical_name FROM memory_entities WHERE id = ?',
      [canonId],
    );
    expect(ent[0]?.values[0]?.[0]).toBe('File');
    expect(ent[0]?.values[0]?.[1]).toBe('packages/foo/bar.ts');
  });

  // 回帰(レビュー#1): 実 File entity が canonicalize 済みで**既存**でも、UNIQUE(type,canonical_name)
  // 衝突で entity 確保が黙ってスキップされ FK 違反が再発しないこと。合成 file: は既存の実 entity に
  // 連結し、二重 File entity を作らない。
  it('real File entity が既存でも file: candidate は連結して insert 成功（重複作成なし）', () => {
    const db = makeDb();
    const path = 'packages/foo/bar.ts';
    const canon = canonicalize(path);
    const realId = entityId('File', canon);
    // ingest 相当: 正準 File entity を先行作成
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, ?, ?, ?)`,
      [realId, canon, path, TS, TS, TS],
    );

    const result = reportDriftEvents({
      db,
      candidates: [
        makeCandidate(`file:${path}`, {
          predicate: 'affects',
          drift_type: 'regression_cluster',
          severity: 'error',
        }),
      ],
      recordedAt: TS,
      logger: silentLogger,
    });

    expect(result.events_inserted).toBe(1);
    // File entity は重複せず 1 件のまま。
    const cnt = db.exec(
      "SELECT COUNT(*) FROM memory_entities WHERE type = 'File' AND canonical_name = ?",
      [canon],
    );
    expect(cnt[0]?.values[0]?.[0]).toBe(1);
    // drift は既存の実 entity に連結。
    const drift = db.exec("SELECT subject_entity_id FROM memory_drift_events WHERE drift_type='regression_cluster'");
    expect(drift[0]?.values[0]?.[0]).toBe(realId);
  });

  it('synthetic package: / spec_clarification: id も entity 確保して insert 成功', () => {
    const db = makeDb();
    const result = reportDriftEvents({
      db,
      candidates: [
        makeCandidate('package:trail-viewer', {
          predicate: 'spec_violation',
          drift_type: 'spec_violation_cluster',
          severity: 'warn',
        }),
        makeCandidate('spec_clarification:auth-flow', {
          predicate: 'clarifies',
          drift_type: 'spec_clarification_recurring',
          severity: 'info',
        }),
      ],
      recordedAt: TS,
      logger: silentLogger,
    });
    expect(result.events_inserted).toBe(2);
    // package: は正準 Package entity（canonical_name=canonicalize）へ写像。
    const pkgId = entityId('Package', canonicalize('trail-viewer'));
    const pkg = db.exec('SELECT type, canonical_name FROM memory_entities WHERE id = ?', [pkgId]);
    expect(pkg[0]?.values[0]?.[0]).toBe('Package');
    // spec_clarification: は対応する実 entity が無いため接頭辞付き id の Question entity。
    const q = db.exec(
      "SELECT type FROM memory_entities WHERE id = 'spec_clarification:auth-flow'",
    );
    expect(q[0]?.values[0]?.[0]).toBe('Question');
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
