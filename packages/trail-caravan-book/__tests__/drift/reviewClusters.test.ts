import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../src/db/migrations/runner';
import {
  detectReviewUnfixed,
  detectReviewVsCode,
  detectRecurringReviewFindings,
} from '../../src/drift/reviewClusters';
import type { CaravanLogger } from '../../src/logger';

const silentLogger: CaravanLogger = { info: () => {}, error: () => {} };

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS = '2026-01-01T00:00:00.000Z';
let seq = 0;

function insertEntity(db: BetterSqlite3CaravanDb, id?: string, type = 'Bug'): string {
  const eid = id ?? `ent-${++seq}`;
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eid, type, eid, eid, TS, TS, TS],
  );
  return eid;
}

function insertReview(db: BetterSqlite3CaravanDb, id?: string, workspace = ''): string {
  const rid = id ?? `rev-${++seq}`;
  const reviewEntity = insertEntity(db, `rev-ent-${rid}`, 'Review');
  db.run(
    `INSERT INTO caravan_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at, workspace)
     VALUES (?, 'review_doc', ?, ?, 'code', 'Test Review', ?, ?, ?)`,
    [rid, rid, reviewEntity, TS, TS, workspace],
  );
  return rid;
}

function insertReviewFinding(
  db: BetterSqlite3CaravanDb,
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
    `INSERT INTO caravan_review_findings
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
  db: BetterSqlite3CaravanDb,
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
    `INSERT INTO caravan_edges
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

describe('ワークスペースの解決', () => {
  it('review_unfixed はレビューの workspace を引き継ぐ', () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'ws-rev-1', 'anytime-trade');
    const findingEntity = insertEntity(db, 'ws-finding-ent-1', 'ReviewFinding');
    insertReviewFinding(db, {
      id: 'ws-rf-1',
      reviewId,
      findingEntityId: findingEntity,
      severity: 'error',
      recordedAt: TS,
      addressedAt: null,
    });

    const results = detectReviewUnfixed({ db, daysOld: 30, minSeverity: 'warn', logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-trade');
  });

  it('recurring_review_finding は指摘が 2 ワークスペースに跨ると未解決のまま', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const reviewA = insertReview(db, 'ws-rev-a', 'anytime-trade');
    const reviewB = insertReview(db, 'ws-rev-b', 'anytime-markdown');
    for (const [id, reviewId] of [['ws-rf-a', reviewA], ['ws-rf-b', reviewB]] as const) {
      const entity = insertEntity(db, `ws-fe-${id}`, 'ReviewFinding');
      insertReviewFinding(db, {
        id,
        reviewId,
        findingEntityId: entity,
        targetFilePath: 'src/mixed.ts',
        category: 'perf',
        recordedAt: recent,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('');
  });

  it('未解決（空文字）の指摘が混ざっても解決済みのワークスペースへ寄せる', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const reviewA = insertReview(db, 'ws-rev-blank-a', 'anytime-trade');
    const reviewB = insertReview(db, 'ws-rev-blank-b', '');
    for (const [id, reviewId] of [['ws-rf-ba', reviewA], ['ws-rf-bb', reviewB]] as const) {
      const entity = insertEntity(db, `ws-fe-${id}`, 'ReviewFinding');
      insertReviewFinding(db, {
        id,
        reviewId,
        findingEntityId: entity,
        targetFilePath: 'src/blank.ts',
        category: 'perf',
        recordedAt: recent,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-trade');
  });

  it('recurring_review_finding は指摘が単一ワークスペースなら確定する', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const reviewId = insertReview(db, 'ws-rev-single', 'anytime-lab');
    for (const [index, id] of ['ws-rf-s1', 'ws-rf-s2'].entries()) {
      const entity = insertEntity(db, `ws-fe-${id}`, 'ReviewFinding');
      insertReviewFinding(db, {
        id,
        reviewId,
        findingIndex: index,
        findingEntityId: entity,
        targetFilePath: 'src/single.ts',
        category: 'perf',
        recordedAt: recent,
      });
    }

    const results = detectRecurringReviewFindings({ db, windowDays: 90, minCount: 2, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].workspace).toBe('anytime-lab');
  });
});
