import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  detectReviewUnfixed,
  detectReviewVsCode,
  detectRecurringReviewFindings,
} from '../../src/drift/reviewClusters';
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

function insertEntity(db: Database, id?: string, type = 'Bug'): string {
  const eid = id ?? `ent-${++seq}`;
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eid, type, eid, eid, TS, TS, TS],
  );
  return eid;
}

function insertReview(db: Database, id?: string): string {
  const rid = id ?? `rev-${++seq}`;
  const reviewEntity = insertEntity(db, `rev-ent-${rid}`, 'Review');
  db.run(
    `INSERT INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, 'review_doc', ?, ?, 'code', 'Test Review', ?, ?)`,
    [rid, rid, reviewEntity, TS, TS],
  );
  return rid;
}

function insertReviewFinding(
  db: Database,
  opts: {
    id?: string;
    reviewId: string;
    findingIndex?: number;
    findingEntityId: string;
    targetFilePath?: string;
    severity?: 'info' | 'warn' | 'error';
    category?: string;
    recordedAt?: string;
    addressedAt?: string | null;
  },
): string {
  const id = opts.id ?? `rf-${++seq}`;
  db.run(
    `INSERT INTO memory_review_findings
       (id, review_id, finding_entity_id, finding_index, target_file_path,
        severity, category, finding_text, recorded_at, addressed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.reviewId,
      opts.findingEntityId,
      opts.findingIndex ?? seq,
      opts.targetFilePath ?? 'src/foo.ts',
      opts.severity ?? 'warn',
      opts.category ?? 'logic',
      'finding text',
      opts.recordedAt ?? TS,
      opts.addressedAt ?? null,
    ],
  );
  return id;
}

function insertEdge(
  db: Database,
  opts: {
    id?: string;
    subjectEntityId: string;
    predicate: string;
    objectEntityId?: string;
    objectLiteral?: string;
    sourceType?: string;
    confidence?: number;
  },
): void {
  const id = opts.id ?? `edge-${++seq}`;
  db.run(
    `INSERT INTO memory_edges
       (id, subject_entity_id, predicate, object_entity_id, object_literal, source_type, source_ref,
        confidence, confidence_label, modality, valid_from, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EXTRACTED', 'asserted', ?, ?)`,
    [
      id,
      opts.subjectEntityId,
      opts.predicate,
      opts.objectEntityId ?? null,
      opts.objectLiteral ?? null,
      opts.sourceType ?? 'review',
      `ref-${id}`,
      opts.confidence ?? 0.8,
      TS,
      TS,
    ],
  );
}

describe('detectReviewUnfixed', () => {
  it('未解決の warn finding が daysOld 以上古ければ検知', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const e1 = insertEntity(db, undefined, 'ReviewFinding');
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: e1,
      severity: 'warn',
      recordedAt: TS,
      addressedAt: null,
    });

    const results = detectReviewUnfixed({ db, daysOld: 1, minSeverity: 'warn', logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('review_unfixed');
    expect(results[0].severity).toBe('warn');
    expect(results[0].subject_entity_id).toBe(e1);
  });

  it('addressed_at が設定済み → 検知なし', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const e1 = insertEntity(db, undefined, 'ReviewFinding');
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: e1,
      severity: 'warn',
      recordedAt: TS,
      addressedAt: TS,
    });

    const results = detectReviewUnfixed({ db, daysOld: 1, minSeverity: 'warn', logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('minSeverity=error のとき warn は除外', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const e1 = insertEntity(db, undefined, 'ReviewFinding');
    const e2 = insertEntity(db, undefined, 'ReviewFinding');
    insertReviewFinding(db, { reviewId: rev, findingIndex: 1, findingEntityId: e1, severity: 'warn', recordedAt: TS });
    insertReviewFinding(db, { reviewId: rev, findingIndex: 2, findingEntityId: e2, severity: 'error', recordedAt: TS });

    const results = detectReviewUnfixed({ db, daysOld: 1, minSeverity: 'error', logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe('error');
  });

  it('新しすぎる finding (daysOld 未満) → 検知なし', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const e1 = insertEntity(db, undefined, 'ReviewFinding');
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');
    insertReviewFinding(db, { reviewId: rev, findingEntityId: e1, severity: 'warn', recordedAt: recent });

    const results = detectReviewUnfixed({ db, daysOld: 30, minSeverity: 'warn', logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectReviewVsCode', () => {
  it('review と code で同 predicate の値が異なる → drift_event 1 件', () => {
    const db = makeDb();
    const subject = insertEntity(db);

    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceA',
      sourceType: 'review',
    });
    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceB',
      sourceType: 'code',
    });

    const results = detectReviewVsCode({ db, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('review_vs_code');
    expect(results[0].subject_entity_id).toBe(subject);
  });

  it('review と code の値が同じ → 検知なし', () => {
    const db = makeDb();
    const subject = insertEntity(db);

    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceA',
      sourceType: 'review',
    });
    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceA',
      sourceType: 'code',
    });

    const results = detectReviewVsCode({ db, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('relates_to predicate は除外', () => {
    const db = makeDb();
    const subject = insertEntity(db);

    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'relates_to',
      objectLiteral: 'A',
      sourceType: 'review',
    });
    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'relates_to',
      objectLiteral: 'B',
      sourceType: 'code',
    });

    const results = detectReviewVsCode({ db, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('confidence < 0.6 のエッジは除外', () => {
    const db = makeDb();
    const subject = insertEntity(db);

    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceA',
      sourceType: 'review',
      confidence: 0.5,
    });
    insertEdge(db, {
      subjectEntityId: subject,
      predicate: 'uses',
      objectLiteral: 'InterfaceB',
      sourceType: 'code',
      confidence: 0.5,
    });

    const results = detectReviewVsCode({ db, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});

describe('detectRecurringReviewFindings', () => {
  it('同 file_path × category で minCount 以上 → drift_event 1 件', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    for (let i = 0; i < 3; i++) {
      const e = insertEntity(db, undefined, 'ReviewFinding');
      insertReviewFinding(db, {
        reviewId: rev,
        findingIndex: i + 1,
        findingEntityId: e,
        targetFilePath: 'src/core.ts',
        category: 'spec',
        recordedAt: recent,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 90, minCount: 3, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('recurring_review_finding');
    expect(results[0].subject_entity_id).toBe('file:src/core.ts');
    expect(results[0].severity).toBe('warn');
  });

  it('minCount 未満 → 検知なし', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    for (let i = 0; i < 2; i++) {
      const e = insertEntity(db, undefined, 'ReviewFinding');
      insertReviewFinding(db, {
        reviewId: rev,
        findingIndex: i + 1,
        findingEntityId: e,
        targetFilePath: 'src/utils.ts',
        category: 'spec',
        recordedAt: recent,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 90, minCount: 3, logger: silentLogger });
    expect(results).toHaveLength(0);
  });

  it('windowDays 外のレコードは除外', () => {
    const db = makeDb();
    const rev = insertReview(db);

    for (let i = 0; i < 3; i++) {
      const e = insertEntity(db, undefined, 'ReviewFinding');
      insertReviewFinding(db, {
        reviewId: rev,
        findingIndex: i + 1,
        findingEntityId: e,
        targetFilePath: 'src/old.ts',
        category: 'spec',
        recordedAt: TS,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 30, minCount: 3, logger: silentLogger });
    expect(results).toHaveLength(0);
  });
});
