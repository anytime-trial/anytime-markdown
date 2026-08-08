/**
 * Flight Record（指示単位）へ畳んだレビュー指摘の取得。
 *
 * 検査したいのは「session 経路のレビューが指示 ID へ正しく畳まれること」で、
 * 明示宣言（trail.instruction_sessions）と暗黙グループ（1 セッション = 1 指示）の
 * 両方を 1 つの結果に混ぜて返せるかが本質。
 */
import { BetterSqlite3MemoryDb, runMigrations, type MemoryDbSqlValue } from '@anytime-markdown/trail-caravan-book';
import { FlightRecordDatabase } from '@anytime-markdown/trail-db';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { MemoryApiHandler } from '../MemoryApiHandler';

const TS = '2026-05-09T10:00:00.000Z';
const TS2 = '2026-05-10T10:00:00.000Z';

/** 宣言済み指示に属するセッション。 */
const DECLARED_SESSION = 'ses-declared-0001';
/** 宣言の無いセッション（暗黙グループ = instructionId は session_id 自身）。 */
const IMPLICIT_SESSION = 'ses-implicit-0002';
const INSTRUCTION_ID = 'ins-0001';

function seedMemoryDb(dbPath: string): void {
  const db = new BetterSqlite3MemoryDb({ filePath: dbPath });
  runMigrations(db);
  const run = (sql: string, params: readonly MemoryDbSqlValue[] = []): void => {
    db.run(sql, params);
  };

  run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Package', 'trail-viewer', 'trail-viewer', ?, ?, ?)`,
    ['ent-1', TS, TS, TS],
  );

  const insertReview = (id: string, sourceRef: string, kind: string, reviewedAt: string): void => {
    run(
      `INSERT INTO memory_reviews (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewer, reviewed_at, recorded_at, workspace)
       VALUES (?, ?, ?, 'ent-1', 'code', ?, 'pr-review-toolkit:code-reviewer', ?, ?, 'anytime-markdown')`,
      [id, kind, sourceRef, `Session review ${id}`, reviewedAt, reviewedAt],
    );
  };
  const insertFinding = (
    id: string,
    reviewId: string,
    index: number,
    severity: string,
    targetFilePath: string | null,
  ): void => {
    run(
      `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, recorded_at)
       VALUES (?, ?, 'ent-1', ?, ?, 'logic', ?, ?, ?)`,
      [id, reviewId, index, targetFilePath, severity, `finding ${id}`, TS],
    );
  };

  insertReview('rev-declared', `${DECLARED_SESSION}#uuid-a`, 'session', TS);
  insertFinding('rf-d1', 'rev-declared', 0, 'error', 'packages/trail-viewer/src/a.ts');
  insertFinding('rf-d2', 'rev-declared', 1, 'warn', null);

  insertReview('rev-implicit', `${IMPLICIT_SESSION}#uuid-b`, 'session', TS2);
  insertFinding('rf-i1', 'rev-implicit', 0, 'info', 'packages/trail-server/src/b.ts');

  // session を持たない経路は Flight Record へ畳めない（一覧へ出さない）
  insertReview('rev-doc', 'review/r1.md', 'review_doc', TS);
  insertFinding('rf-doc', 'rev-doc', 0, 'error', 'packages/trail-viewer/src/c.ts');

  // Bug Fixed 一覧の指示名列も同じ畳み方（宣言済み / 暗黙 / セッション不明）を通る
  const insertBugFix = (id: string, sha: string, sessionId: string | null): void => {
    run(
      `INSERT INTO memory_bug_fixes (id, commit_sha, bug_entity_id, package, category, subject_summary, committed_at, recorded_at, related_session_id)
       VALUES (?, ?, 'ent-1', 'trail-viewer', 'logic', ?, ?, ?, ?)`,
      [id, sha, `bug ${id}`, TS, TS, sessionId],
    );
  };
  insertBugFix('bf-declared', 'sha-declared', DECLARED_SESSION);
  insertBugFix('bf-implicit', 'sha-implicit', IMPLICIT_SESSION);
  insertBugFix('bf-orphan', 'sha-orphan', null);

  db.close();
}

/**
 * instruction_sessions は caravan-book.db 側へ移設済み（2026-08-07）のため、activity.db では
 * なく memoryDbPath へ FlightRecordDatabase 経由でシードする（openInstruction がテーブルを
 * 冪等作成し、instruction_sessions へ起点セッションを紐付ける）。
 */
function seedInstructionSession(memoryDbPath: string): void {
  const flightDb = new FlightRecordDatabase(memoryDbPath);
  flightDb.init();
  flightDb.openInstruction({
    id: INSTRUCTION_ID,
    sessionId: DECLARED_SESSION,
    workspacePath: '/anytime-markdown',
    workspaceName: 'anytime-markdown',
    summary: 'seed instruction',
    originPrompt: 'seed',
    startedAt: TS,
  });
  flightDb.close();
}

describe('MemoryApiHandler flight review findings', () => {
  let tmpDir: string;
  let handler: MemoryApiHandler;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-flight-findings-'));
    const memoryDbPath = path.join(tmpDir, 'caravan-book.db');
    seedMemoryDb(memoryDbPath);
    seedInstructionSession(memoryDbPath);
    handler = new MemoryApiHandler(makeMockLogger(), memoryDbPath);
    // activity.db の ATTACH は openReadOnly 内の非同期処理。最初の呼び出しで接続を張り、
    // ATTACH の解決を待ってから本検証に入る（待たないと trail.* が未解決のまま走る）。
    await handler.getFlightReviewFindingCounts();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('宣言済みセッションの指摘は指示 ID へ畳まれる', async () => {
    const rows = await handler.getFlightReviewFindings({ instructionIds: [INSTRUCTION_ID] });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.instructionId === INSTRUCTION_ID)).toBe(true);
    expect(rows.every((r) => r.sessionId === DECLARED_SESSION)).toBe(true);
    expect(rows.map((r) => r.severity).sort()).toEqual(['error', 'warn']);
    expect(rows.find((r) => r.id === 'rf-d1')?.targetFilePath).toBe('packages/trail-viewer/src/a.ts');
    // target_file_path が無い指摘も落とさない（リンクにしないだけ）
    expect(rows.find((r) => r.id === 'rf-d2')?.targetFilePath).toBeNull();
  });

  it('宣言の無いセッションは session_id を指示 ID として扱う', async () => {
    const rows = await handler.getFlightReviewFindings({ instructionIds: [IMPLICIT_SESSION] });
    expect(rows.map((r) => r.id)).toEqual(['rf-i1']);
    expect(rows[0].instructionId).toBe(IMPLICIT_SESSION);
  });

  it('session を持たない経路（review_doc）は返さない', async () => {
    const rows = await handler.getFlightReviewFindings({});
    expect(rows.map((r) => r.id).sort()).toEqual(['rf-d1', 'rf-d2', 'rf-i1']);
  });

  // Bug Fixed 一覧は指示名を出すため、指摘と同じ規則で instruction_id を解決する必要がある。
  it('バグ修正も指示 ID へ畳む（宣言済み → 指示 ID / 宣言なし → セッション ID / 不明 → null）', async () => {
    const rows = await handler.getBugHistory({});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('bf-declared')?.instructionId).toBe(INSTRUCTION_ID);
    expect(byId.get('bf-implicit')?.instructionId).toBe(IMPLICIT_SESSION);
    expect(byId.get('bf-orphan')?.instructionId).toBeNull();
  });

  it('件数は指示単位で severity 別に集計する', async () => {
    const counts = await handler.getFlightReviewFindingCounts();
    const byId = new Map(counts.map((c) => [c.instructionId, c]));
    expect(byId.get(INSTRUCTION_ID)).toEqual({
      instructionId: INSTRUCTION_ID, error: 1, warn: 1, info: 0, total: 2,
    });
    expect(byId.get(IMPLICIT_SESSION)).toEqual({
      instructionId: IMPLICIT_SESSION, error: 0, warn: 0, info: 1, total: 1,
    });
    // review_doc 経路は集計にも入らない
    expect(counts).toHaveLength(2);
  });

  it('一覧は reviewed_at の降順で返す', async () => {
    const rows = await handler.getFlightReviewFindings({ limit: 10 });
    expect(rows[0].reviewedAt >= rows[rows.length - 1].reviewedAt).toBe(true);
    expect(rows[0].sessionId).toBe(IMPLICIT_SESSION);
  });

  // 一覧の打ち切りは件数（集計・上限なし）とだけ食い違い、詳細ペインが「指摘なし」・
  // 件数列が非ゼロという矛盾表示になる。共有の 200 キャップへ戻る退行をここで止める。
  it('200 件を超える limit 指定を 200 へ丸めない', async () => {
    const manyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-flight-findings-many-'));
    const memoryDbPath = path.join(manyDir, 'caravan-book.db');
    seedMemoryDb(memoryDbPath);
    seedInstructionSession(memoryDbPath);

    const db = new BetterSqlite3MemoryDb({ filePath: memoryDbPath });
    db.run(
      `INSERT INTO memory_reviews (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewer, reviewed_at, recorded_at, workspace)
       VALUES ('rev-bulk', 'session', ?, 'ent-1', 'code', 'bulk', 'code-reviewer', ?, ?, 'anytime-markdown')`,
      [`${IMPLICIT_SESSION}#uuid-bulk`, TS, TS],
    );
    // 1 件ずつ commit すると 250 回の fsync でテストが分単位になる
    db.run('BEGIN');
    for (let i = 0; i < 250; i++) {
      db.run(
        `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, recorded_at)
         VALUES (?, 'rev-bulk', 'ent-1', ?, 'packages/x.ts', 'logic', 'info', ?, ?)`,
        [`rf-bulk-${i}`, i, `bulk ${i}`, TS],
      );
    }
    db.run('COMMIT');
    db.close();

    const h = new MemoryApiHandler(makeMockLogger(), memoryDbPath);
    try {
      await h.getFlightReviewFindingCounts();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const rows = await h.getFlightReviewFindings({ limit: 400 });
      expect(rows.length).toBeGreaterThan(200);
    } finally {
      h.dispose();
      fs.rmSync(manyDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('activity.db が無ければ空を返しログへ理由を残す', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-flight-findings-noattach-'));
    const memoryDbPath = path.join(emptyDir, 'caravan-book.db');
    seedMemoryDb(memoryDbPath);
    const logger = makeMockLogger();
    const h = new MemoryApiHandler(logger, memoryDbPath);
    try {
      expect(await h.getFlightReviewFindings({})).toEqual([]);
      expect(await h.getFlightReviewFindingCounts()).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    } finally {
      h.dispose();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
