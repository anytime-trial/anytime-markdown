import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  detectRegressionClusters,
  detectSpecViolationClusters,
  detectRecurringRootCauses,
} from '../../src/drift/recurringBugs';
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
let seq = 0;

function insertEntity(db: Database, id?: string): string {
  const eid = id ?? `ent-${++seq}`;
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, ?, ?, ?, ?)`,
    [eid, eid, eid, TS, TS, TS],
  );
  return eid;
}

function insertBugFix(
  db: Database,
  opts: {
    id?: string;
    commitSha: string;
    bugEntityId: string;
    package?: string;
    category: string;
    affectedPaths?: string[];
    committedAt?: string;
  },
): void {
  const id = opts.id ?? `bf-${opts.commitSha}`;
  const paths = JSON.stringify(opts.affectedPaths ?? []);
  const committedAt = opts.committedAt ?? TS;
  db.run(
    `INSERT INTO memory_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary, affected_file_paths_json, committed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, opts.commitSha, opts.bugEntityId, opts.package ?? 'web-app', opts.category, 'summary', paths, committedAt, TS],
  );
}

describe('detectRegressionClusters', () => {
  it('I12: 同 file_path に regression 2 件 → drift_event 1 行 (severity=error)', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    insertBugFix(db, { commitSha: 'sha1', bugEntityId: e1, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent });
    insertBugFix(db, { commitSha: 'sha2', bugEntityId: e2, category: 'regression', affectedPaths: ['src/foo.ts'], committedAt: recent });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('regression_cluster');
    expect(results[0].severity).toBe('error');
    expect(results[0].subject_entity_id).toBe('file:src/foo.ts');
  });

  it('regression 1 件のみ → 検知なし', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    insertBugFix(db, { commitSha: 'sha3', bugEntityId: e1, category: 'regression', affectedPaths: ['src/bar.ts'], committedAt: TS });

    const results = detectRegressionClusters({ db, windowDays: 90, minCount: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('期間外のコミット → 検知なし', () => {
    const db = makeDb();
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    const oldDate = '2020-01-01T00:00:00.000Z';
    insertBugFix(db, { commitSha: 'sha4', bugEntityId: e1, category: 'regression', affectedPaths: ['src/old.ts'], committedAt: oldDate });
    insertBugFix(db, { commitSha: 'sha5', bugEntityId: e2, category: 'regression', affectedPaths: ['src/old.ts'], committedAt: oldDate });

    const results = detectRegressionClusters({ db, windowDays: 30, minCount: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectSpecViolationClusters', () => {
  it('I13: 同 package で spec 3 件以上 + 全体 30% 以上 → drift_event 1 行', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    // web-app: spec x3, logic x1 → 3/4 = 75%
    for (let i = 0; i < 3; i++) {
      const e = insertEntity(db);
      insertBugFix(db, { commitSha: `spec-sha${i}`, bugEntityId: e, package: 'web-app', category: 'spec', affectedPaths: [], committedAt: recent });
    }
    const e4 = insertEntity(db);
    insertBugFix(db, { commitSha: 'logic-sha', bugEntityId: e4, package: 'web-app', category: 'logic', affectedPaths: [], committedAt: recent });

    const results = detectSpecViolationClusters({ db, windowDays: 90, minCount: 3, minRatio: 0.3, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('spec_violation_cluster');
    expect(results[0].severity).toBe('warn');
  });

  it('spec 2 件のみ → minCount=3 未満で検知なし', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    for (let i = 0; i < 2; i++) {
      const e = insertEntity(db);
      insertBugFix(db, { commitSha: `spec2-sha${i}`, bugEntityId: e, package: 'pkg-a', category: 'spec', affectedPaths: [], committedAt: recent });
    }

    const results = detectSpecViolationClusters({ db, windowDays: 90, minCount: 3, minRatio: 0.3, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectRecurringRootCauses', () => {
  it('I14: 同 caused_by 先 entity に Bug 2 件 → drift_event 1 行', () => {
    const db = makeDb();
    // root cause entity
    const rootCause = insertEntity(db, 'root-concept-1');

    // Bug entity 2件
    const bug1 = insertEntity(db, 'bug-entity-1');
    const bug2 = insertEntity(db, 'bug-entity-2');

    // caused_by edges
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-1', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      ['edge-1', bug1, rootCause, TS, TS],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-2', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      ['edge-2', bug2, rootCause, TS, TS],
    );

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('recurring_root_cause');
    expect(results[0].subject_entity_id).toBe(rootCause);
    expect(results[0].severity).toBe('warn');
  });

  it('AMBIGUOUS edge は除外される', () => {
    const db = makeDb();
    const rootCause = insertEntity(db, 'root-concept-2');
    const bug1 = insertEntity(db, 'bug-entity-3');
    const bug2 = insertEntity(db, 'bug-entity-4');

    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-amb-1', 0.3, 'AMBIGUOUS', 'asserted', ?, ?)`,
      ['edge-amb-1', bug1, rootCause, TS, TS],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, source_type, source_ref, confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES (?, ?, 'caused_by', ?, 'bug_history', 'ref-amb-2', 0.3, 'AMBIGUOUS', 'asserted', ?, ?)`,
      ['edge-amb-2', bug2, rootCause, TS, TS],
    );

    const results = detectRecurringRootCauses({ db, minBugs: 2, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});
