import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { postProcessF22 } from '../../src/drift/postProcessF22';
import type { MemoryLogger } from '../../src/logger';
import type { DriftEventInput } from '../../src/drift/report';

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

function insertEntity(
  db: Database,
  opts: {
    id?: string;
    type?: string;
    attrsJson?: string;
  } = {},
): string {
  const eid = opts.id ?? `ent-${++seq}`;
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at, attributes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [eid, opts.type ?? 'ReviewFinding', eid, eid, TS, TS, TS, opts.attrsJson ?? '{}'],
  );
  return eid;
}

function insertReview(db: Database, id?: string): string {
  const rid = id ?? `rev-${++seq}`;
  const reviewEntity = insertEntity(db, { id: `rev-ent-${rid}`, type: 'Review' });
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
    findingEntityId: string;
    findingIndex?: number;
    targetFilePath?: string;
    category?: string;
  },
): string {
  const id = opts.id ?? `rf-${++seq}`;
  db.run(
    `INSERT INTO memory_review_findings
       (id, review_id, finding_entity_id, finding_index, target_file_path, category, finding_text, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, 'text', ?)`,
    [
      id,
      opts.reviewId,
      opts.findingEntityId,
      opts.findingIndex ?? seq,
      opts.targetFilePath ?? null,
      opts.category ?? 'other',
      TS,
    ],
  );
  return id;
}

function makeDriftEvent(targetSpecPath: string | null): DriftEventInput {
  const groupKey = targetSpecPath ?? 'symbol:MyClass';
  return {
    subject_entity_id: `spec_clarification:${groupKey}`,
    predicate: 'recurring_question',
    conversation_value: null,
    spec_value: null,
    code_value: null,
    drift_type: 'spec_clarification_recurring',
    severity: 'warn',
    detail: {
      target_spec_path: targetSpecPath,
      group_key: groupKey,
      question_ids: [],
      pairs: [],
    },
  };
}

describe('postProcessF22', () => {
  it('I16: spec_clarification_recurring イベント + category=other の finding → category_suggested=spec に更新', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const entity = insertEntity(db, { attrsJson: '{"existing":"value"}' });
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: entity,
      targetFilePath: 'spec/api.md',
      category: 'other',
    });

    const driftEvents = [makeDriftEvent('spec/api.md')];
    const result = postProcessF22({ db, driftEvents, recordedAt: TS, logger: silentLogger });

    expect(result.findings_suggested).toBe(1);

    const rows = db.exec(`SELECT attributes_json FROM memory_entities WHERE id = ?`, [entity]);
    const attrs = JSON.parse(rows[0].values[0][0] as string);
    expect(attrs['category_suggested']).toBe('spec');
    expect(attrs['existing']).toBe('value');
    expect(attrs['suggested_at']).toBe(TS);
  });

  it('category が other 以外の finding → 対象外（更新されない）', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const entity = insertEntity(db);
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: entity,
      targetFilePath: 'spec/api.md',
      category: 'logic',
    });

    const driftEvents = [makeDriftEvent('spec/api.md')];
    const result = postProcessF22({ db, driftEvents, recordedAt: TS, logger: silentLogger });

    expect(result.findings_suggested).toBe(0);
  });

  it('drift_type が spec_clarification_recurring 以外 → 無視', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const entity = insertEntity(db);
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: entity,
      targetFilePath: 'spec/api.md',
      category: 'other',
    });

    const driftEvents: DriftEventInput[] = [
      {
        subject_entity_id: 'file:src/foo.ts',
        predicate: 'affects',
        conversation_value: null,
        spec_value: null,
        code_value: null,
        drift_type: 'regression_cluster',
        severity: 'error',
        detail: { target_spec_path: 'spec/api.md' },
      },
    ];
    const result = postProcessF22({ db, driftEvents, recordedAt: TS, logger: silentLogger });

    expect(result.findings_suggested).toBe(0);
  });

  it('target_spec_path が null の場合 → スキップ', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const entity = insertEntity(db);
    insertReviewFinding(db, {
      reviewId: rev,
      findingEntityId: entity,
      targetFilePath: 'spec/api.md',
      category: 'other',
    });

    const driftEvents = [makeDriftEvent(null)];
    const result = postProcessF22({ db, driftEvents, recordedAt: TS, logger: silentLogger });

    expect(result.findings_suggested).toBe(0);
  });

  it('finding が複数件ある場合はすべて更新', () => {
    const db = makeDb();
    const rev = insertReview(db);
    const e1 = insertEntity(db);
    const e2 = insertEntity(db);
    insertReviewFinding(db, { reviewId: rev, findingIndex: 1, findingEntityId: e1, targetFilePath: 'spec/multi.md', category: 'other' });
    insertReviewFinding(db, { reviewId: rev, findingIndex: 2, findingEntityId: e2, targetFilePath: 'spec/multi.md', category: 'other' });

    const driftEvents = [makeDriftEvent('spec/multi.md')];
    const result = postProcessF22({ db, driftEvents, recordedAt: TS, logger: silentLogger });

    expect(result.findings_suggested).toBe(2);
  });
});
