/**
 * 020_workspace_scope — caravan_bug_fixes / caravan_drift_events へのワークスペース列と、
 * レビュー由来 drift の backfill。
 *
 * backfill は「既存行がある DB に列が足される」経路でしか走らないが、migration は
 * 新規 DB でしか実行できない（開いた時点で最新版まで適用される）。そのため backfill だけは
 * migration ファイル内の UPDATE 文をファイルから読んで実行し、SQL 本体を検査する
 * （テスト内に SQL を書き写すと、本番の SQL を直しても気づけないため）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BetterSqlite3CaravanDb } from '../../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../../src/db/migrations/runner';

const TS = '2026-01-01T00:00:00.000Z';

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../src/db/migrations/020_workspace_scope.sql',
);

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * migration ファイルから backfill の UPDATE 文だけを取り出す。
 * 020 は 023（テーブル接頭辞移行）より前の歴史ファイルで memory_* の旧名のまま凍結されている。
 * 本テストは最新スキーマ（caravan_*）へ適用済みの DB で SQL の意味を検査するため、
 * 実行前にテーブル名だけ 023 と同じ対応で新名へ読み替える。
 */
function backfillStatements(): string[] {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const statements = sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.startsWith('UPDATE memory_drift_events'))
    .map((s) => s.replace(/\bmemory_/g, 'caravan_'));
  // 取り出せなかったら「0 件で成功」に化けるので、ここで落とす
  expect(statements.length).toBe(2);
  return statements;
}

function columnNames(db: BetterSqlite3CaravanDb, table: string): string[] {
  const res = db.exec(`PRAGMA table_info(${table})`);
  return (res[0]?.values ?? []).map((row) => String(row[1]));
}

function insertEntity(db: BetterSqlite3CaravanDb, id: string, type = 'Concept'): string {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, id, id, TS, TS, TS],
  );
  return id;
}

function insertReview(db: BetterSqlite3CaravanDb, id: string, workspace: string): string {
  insertEntity(db, `rev-ent-${id}`, 'Review');
  db.run(
    `INSERT INTO caravan_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at, workspace)
     VALUES (?, 'review_doc', ?, ?, 'code', 'Test Review', ?, ?, ?)`,
    [id, id, `rev-ent-${id}`, TS, TS, workspace],
  );
  return id;
}

function insertFinding(
  db: BetterSqlite3CaravanDb,
  opts: { id: string; reviewId: string; index: number },
): string {
  insertEntity(db, `fe-${opts.id}`, 'ReviewFinding');
  db.run(
    `INSERT INTO caravan_review_findings
       (id, review_id, finding_entity_id, finding_index, severity, category, finding_text, recorded_at)
     VALUES (?, ?, ?, ?, 'error', 'other', 'text', ?)`,
    [opts.id, opts.reviewId, `fe-${opts.id}`, opts.index, TS],
  );
  return opts.id;
}

function insertDriftEvent(
  db: BetterSqlite3CaravanDb,
  opts: { id: string; subjectEntityId: string; driftType: string; detail: unknown },
): void {
  db.run(
    `INSERT INTO caravan_drift_events
       (id, subject_entity_id, predicate, drift_type, severity, detected_at, detail_json)
     VALUES (?, ?, ?, ?, 'warn', ?, ?)`,
    [opts.id, opts.subjectEntityId, `pred-${opts.id}`, opts.driftType, TS, JSON.stringify(opts.detail)],
  );
}

function workspaceOf(db: BetterSqlite3CaravanDb, driftId: string): string {
  const res = db.exec('SELECT workspace FROM caravan_drift_events WHERE id = ?', [driftId]);
  return String(res[0]?.values[0]?.[0] ?? '<missing>');
}

describe('020_workspace_scope migration', () => {
  it('caravan_bug_fixes / caravan_drift_events に workspace 列が足される', () => {
    const db = makeDb();
    expect(columnNames(db, 'caravan_bug_fixes')).toContain('workspace');
    expect(columnNames(db, 'caravan_drift_events')).toContain('workspace');
  });

  it('既存行の workspace は未解決（空文字）で入る', () => {
    const db = makeDb();
    insertEntity(db, 'bug-ent-1', 'Bug');
    db.run(
      `INSERT INTO caravan_bug_fixes
         (id, commit_sha, bug_entity_id, package, category, subject_summary, committed_at, recorded_at)
       VALUES ('bf-1', 'sha-1', 'bug-ent-1', 'web-app', 'logic', 'summary', ?, ?)`,
      [TS, TS],
    );
    const res = db.exec('SELECT workspace FROM caravan_bug_fixes WHERE id = ?', ['bf-1']);
    expect(res[0]?.values[0]?.[0]).toBe('');
  });

  describe('backfill', () => {
    it('review_unfixed は finding_id からレビューの workspace を復元する', () => {
      const db = makeDb();
      const reviewId = insertReview(db, 'rev-1', 'anytime-trade');
      insertFinding(db, { id: 'rf-1', reviewId, index: 0 });
      insertEntity(db, 'subj-1');
      insertDriftEvent(db, {
        id: 'drift-1',
        subjectEntityId: 'subj-1',
        driftType: 'review_unfixed',
        detail: { finding_id: 'rf-1' },
      });

      for (const stmt of backfillStatements()) db.run(stmt);

      expect(workspaceOf(db, 'drift-1')).toBe('anytime-trade');
    });

    it('recurring_review_finding は finding_ids が単一ワークスペースなら復元する', () => {
      const db = makeDb();
      const reviewId = insertReview(db, 'rev-2', 'anytime-lab');
      insertFinding(db, { id: 'rf-2a', reviewId, index: 0 });
      insertFinding(db, { id: 'rf-2b', reviewId, index: 1 });
      insertEntity(db, 'subj-2');
      insertDriftEvent(db, {
        id: 'drift-2',
        subjectEntityId: 'subj-2',
        driftType: 'recurring_review_finding',
        detail: { finding_ids: ['rf-2a', 'rf-2b'] },
      });

      for (const stmt of backfillStatements()) db.run(stmt);

      expect(workspaceOf(db, 'drift-2')).toBe('anytime-lab');
    });

    it('finding_ids が 2 ワークスペースに跨るなら未解決のまま残す', () => {
      const db = makeDb();
      const reviewA = insertReview(db, 'rev-3a', 'anytime-trade');
      const reviewB = insertReview(db, 'rev-3b', 'anytime-markdown');
      insertFinding(db, { id: 'rf-3a', reviewId: reviewA, index: 0 });
      insertFinding(db, { id: 'rf-3b', reviewId: reviewB, index: 0 });
      insertEntity(db, 'subj-3');
      insertDriftEvent(db, {
        id: 'drift-3',
        subjectEntityId: 'subj-3',
        driftType: 'recurring_review_finding',
        detail: { finding_ids: ['rf-3a', 'rf-3b'] },
      });

      for (const stmt of backfillStatements()) db.run(stmt);

      expect(workspaceOf(db, 'drift-3')).toBe('');
    });

    it('バグ由来の drift（出所がレビューでない）は触らない', () => {
      const db = makeDb();
      insertEntity(db, 'subj-4');
      insertDriftEvent(db, {
        id: 'drift-4',
        subjectEntityId: 'subj-4',
        driftType: 'regression_cluster',
        detail: { file_path: 'src/x.ts', bug_fix_ids: ['a', 'b'], cnt: 2 },
      });

      for (const stmt of backfillStatements()) db.run(stmt);

      expect(workspaceOf(db, 'drift-4')).toBe('');
    });
  });
});
